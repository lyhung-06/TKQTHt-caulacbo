#!/usr/bin/env python3
"""Generate a bounded login-failure test against this private club deployment."""

import http.cookiejar
import ipaddress
import os
import re
import ssl
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPSHandler, HTTPCookieProcessor, Request, build_opener


ATTEMPTS = 8
DEFAULT_URL = "https://127.0.0.1"
TEST_USERNAME = os.environ.get("TEST_USERNAME", "log_test_nonexistent_2026")


class CsrfTokenParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.token = None

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "input" and fields.get("name") == "_csrf":
            self.token = fields.get("value")


def validate_target(base_url):
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("BASE_URL must be an HTTPS URL with no credentials.")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("BASE_URL must contain only the scheme, host, and optional port.")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError as error:
        raise ValueError("BASE_URL host must be a loopback or private IP address.") from error
    if not (address.is_loopback or address.is_private) or address.is_unspecified:
        raise ValueError("Refusing a non-private target; use only this project's loopback/private VM address.")
    if parsed.port not in (None, 443, 8443):
        raise ValueError("Only the project's HTTPS port 443 or 8443 is allowed.")
    return parsed.geturl().rstrip("/")


def main():
    try:
        base_url = validate_target(os.environ.get("BASE_URL", DEFAULT_URL))
    except ValueError as error:
        print(f"Target rejected: {error}", file=sys.stderr)
        return 2
    if not re.fullmatch(r"[A-Za-z0-9_]{3,30}", TEST_USERNAME):
        print("TEST_USERNAME must contain 3-30 letters, numbers, or underscores.", file=sys.stderr)
        return 2

    cookies = http.cookiejar.CookieJar()
    opener = build_opener(
        HTTPCookieProcessor(cookies),
        HTTPSHandler(context=ssl._create_unverified_context()),
    )
    login_url = f"{base_url}/auth/login"
    try:
        with opener.open(login_url, timeout=10) as response:
            parser = CsrfTokenParser()
            parser.feed(response.read().decode("utf-8", errors="replace"))
    except Exception as error:
        print(f"Could not load the project's login page: {error}", file=sys.stderr)
        return 1

    if not parser.token:
        print("Login page did not contain a CSRF token; no test POSTs were sent.", file=sys.stderr)
        return 1

    statuses = []
    for attempt in range(1, ATTEMPTS + 1):
        body = urlencode({
            "_csrf": parser.token,
            "username": TEST_USERNAME,
            "password": "KnownWrong-Test-Only-Not-A-Secret",
        }).encode()
        request = Request(login_url, data=body, headers={
            "Content-Type": "application/x-www-form-urlencoded",
        })
        try:
            with opener.open(request, timeout=10) as response:
                status = response.status
        except HTTPError as error:
            status = error.code
            error.close()
        except Exception as error:
            print(f"Attempt {attempt} failed before receiving an HTTP response: {error}", file=sys.stderr)
            return 1
        statuses.append(status)
        print(f"Attempt {attempt}: HTTP {status}")

    accepted = sum(status < 400 for status in statuses)
    limited = statuses.count(429)
    print(f"Test username: {TEST_USERNAME}")
    print(f"Summary: {accepted} application responses, {limited} rate-limited responses, {ATTEMPTS} requests total.")
    if accepted < 5 or limited < 1:
        print("Expected at least five application responses and one HTTP 429; inspect Nginx rate-limit configuration.", file=sys.stderr)
        return 1
    print("Rate limit check: PASS (HTTP 429 observed; at least five requests reached the application).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
