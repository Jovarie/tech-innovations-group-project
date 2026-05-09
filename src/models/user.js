// src/models/user.js
const bcrypt = require('bcryptjs');

const USERS = [
  {
    id: 'u-001',
    username: 'engineer',
    role: 'senior engineer',
    passwordHash: bcrypt.hashSync('maintain123', 10),
  },
  {
    id: 'u-002',
    username: 'junior',
    role: 'junior technician',
    passwordHash: bcrypt.hashSync('tech123', 10),
  },
  {
    id: 'u-003',
    username: 'secadmin',
    role: 'security admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
  },
  {
    id: 'u-004',
    username: 'auditor',
    role: 'system auditor',
    passwordHash: bcrypt.hashSync('audit123', 10),
  },
];

function getUserByUsername(username) {
  return USERS.find((user) => user.username === username);
}

module.exports = {
  USERS,
  getUserByUsername,
};