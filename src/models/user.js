// src/models/user.js
const bcrypt = require('bcryptjs');

const USERS = [
  {
    id: 'u-001',
    username: 'engineer',
    role: 'senior engineer',
    passwordHash: bcrypt.hashSync('maintain123', 10),
  },
];

function getUserByUsername(username) {
  return USERS.find((user) => user.username === username);
}

module.exports = {
  USERS,
  getUserByUsername,
};