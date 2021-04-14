const Mongo = require('mongoose');
const MongoClient = require('mongodb').MongoClient;
const Environment = require('../environment');

// Allow empty string
Mongo.Schema.Types.String.checkRequired((v) => v !== null);

/**
  Singleton that manages the database
*/
class DatabaseManager
{
  // MARK: - Data fields
  static #instance = null;
  #mongoClientDb = null;

  // MARK: - Constructor
  constructor()
  {
    Mongo.connect(Environment.MONGODB_URI, { useCreateIndex: true, useNewUrlParser: true, useUnifiedTopology: true });
    if(DatabaseManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of DatabaseManager refused');
    }
  }

  static async Init()
  {
    if(DatabaseManager.#instance === null)
    {
      const client = await MongoClient.connect(Environment.MONGODB_URI);
      DatabaseManager.#instance = new DatabaseManager();
      DatabaseManager.#instance.#mongoClientDb = client.db;
    }
    return DatabaseManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {DatabaseManager}  Only instance of model manager
  */
  static GetInstance()
  {
    if(DatabaseManager.#instance === null)
    {
      throw new Error('Database Manager not instantiated');
    }
    return DatabaseManager.#instance;
  }


  async find(collectionName, params)
  {
    return await this.#mongoClientDb.collection(collectionName).find(params);
  }
}
module.exports = DatabaseManager;
