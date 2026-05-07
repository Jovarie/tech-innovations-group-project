const roles = require('../config/roles.json');

class Permissions {
  constructor() {
    this.roles = roles.roles;
  }

  getPermissionsByRoleName(roleName) {
    const role = this.roles.find((role) => role.name === roleName);
    return role ? role.permissions : [];
  }
}

module.exports = Permissions;