const ModelPermission =
{
  admin:  'admin',
  any:    'any',
  customer: 'customer',
  guest:  'guest',
  system: 'system',
  user:   'user'
};
module.exports = ModelPermission;


// Example of PermissionsObject
/*
{
  "permissions":
  {
    "create": ["admin", "system", "user"],
    "delete": ["admin", "system", "user"],
    "query": ["any"],
    "update": ["admin", "system", "user"]
  }
}
*/
