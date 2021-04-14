const { WebsocketServer } = require('../server');

/**
  Singleton that manages the internal servers running on this application
*/
class ServerManager
{
  // MARK: - Data fields
  static #instance = null;

  /* Holds all utility classes
    Format: {k: serverName, v: Server reference} */
  #servers = null;

  /**
    Constructor
    @param  {HttpServer}  httpServer HTTP server
    @param  {Function} validateToken   Method to validate token (TODO: Figure out why circular depdencies not letting us include Ext in Websocket.js)
  */
  constructor(httpServer, validateToken = null)
  {
    if(ServerManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of ServerManager refused');
    }
    if(httpServer === null)
    {
      throw new Error('Attempt to instantiate ServerManager without HttpServer');
    }
    if(validateToken === null)
    {
      throw new Error('Attempt to instantiate ServerManager without validateToken');
    }
    this.#servers = new Map();
    this.#servers.set('websocket', new WebsocketServer(httpServer, validateToken));

    console.log('ServerManager instantiated successfully: true');
  }

  /**
    Initializer
    @param  {HttpServer}  httpServer HTTP server
    @param  {Function} validateToken   Method to validate token (TODO: Figure out why circular depdencies not letting us include Ext in Websocket.js)
    @returns  {ServerManager}  Only instance of manager
  */
  static Init(httpServer, validateToken)
  {
    if(ServerManager.#instance === null)
    {
      ServerManager.#instance = new ServerManager(httpServer, validateToken);
    }
    return ServerManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {ServerManager}  Only instance of manager
  */
  static GetInstance()
  {
    if(ServerManager.#instance === null)
    {
      throw new Error('Attempt to access ServerManager before initialized');
    }
    return ServerManager.#instance;
  }


  get(serverName)
  {
    return this.#servers.get(serverName);
  }

}

module.exports = ServerManager;
