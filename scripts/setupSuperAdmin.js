require('dotenv').config();
const { db, closeDatabase } = require('../src/database');
const bcrypt = require('bcryptjs');

async function main() {
  const targetPassword = 'AdminPassword123!';
  const hashedPassword = await bcrypt.hash(targetPassword, 10);

  const emails = ['admin@mastercrm.com', 'alomgirhasanshakib@gmail.com'];

  for (const email of emails) {
    const user = await db('users').where({ email }).first();
    if (user) {
      await db('users').where({ id: user.id }).update({
        password_hash: hashedPassword,
        status: 'ACTIVE',
        deleted_at: null
      });
      console.log(`Updated password and active status for ${email}`);
    }
  }

  const results = await db('users')
    .join('roles', 'users.role_id', 'roles.id')
    .select('users.id', 'users.email', 'users.status', 'roles.name as role_name', 'roles.slug as role_slug')
    .whereIn('users.email', emails);

  console.log('\n--- Configured Super Admins ---');
  console.log(results);

  await closeDatabase();
}

main().catch(console.error);
