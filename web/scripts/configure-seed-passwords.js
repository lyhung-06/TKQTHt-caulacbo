'use strict';

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const credentials = [
  { username: 'admin', envName: 'ADMIN_INITIAL_PASSWORD' },
  { username: 'officer1', envName: 'OFFICER_INITIAL_PASSWORD' },
  { username: 'officer2', envName: 'OFFICER_INITIAL_PASSWORD' },
  { username: 'member1', envName: 'MEMBER_INITIAL_PASSWORD' },
  { username: 'member2', envName: 'MEMBER_INITIAL_PASSWORD' },
  { username: 'member3', envName: 'MEMBER_INITIAL_PASSWORD' }
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'club_management'
  });

  try {
    const passwordHashes = new Map();
    for (const { envName } of credentials) {
      if (passwordHashes.has(envName)) continue;
      const password = process.env[envName];
      if (!password || password.length < 14 || /[\r\n]/.test(password)) {
        throw new Error(`${envName} must be at least 14 characters and contain no newlines.`);
      }
      passwordHashes.set(envName, await bcrypt.hash(password, 12));
    }

    for (const { username, envName } of credentials) {
      const [result] = await connection.execute(
        'UPDATE users SET password_hash = ? WHERE username = ?',
        [passwordHashes.get(envName), username]
      );
      if (result.affectedRows !== 1) {
        throw new Error(`Expected exactly one seeded account named ${username}.`);
      }
    }
    console.log('Seed account passwords configured from environment variables.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Seed password setup failed:', error.message);
  process.exitCode = 1;
});
