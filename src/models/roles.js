const roles = require('../config/roles.json');

class Role {
    constructor() {
        this.roles = roles.roles; // Load roles from the JSON file
    }

    getRoleByName(name) {
        return this.roles.find(role => role.name === name);
    }

    getAllRoles() {
        return this.roles;
    }
}

module.exports = new Role();