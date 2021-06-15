const Environment = require('../environment');
const Ws          = require('ws');
const { uuid } = require('uuidv4');

/**
  Responsible for handling AWS Pinpoint interactions
*/
class WebsocketServer
{
  #wsServer = null;
  /**
    Format:
    K: => userId
    V: =>
    {
      connection: connection,
      isAlive: true|false
    }
  */
  #clients = {};
  #heartbeatInterval = null;
  #heartbeatIntervalMs = 8000;

  /**
    Constructor
    @param  {HttpServer}  httpServer HTTP server
    @param  {Function} validateToken   Method to validate token (TODO: Figure out why circular depdencies not letting us include Ext in Websocket.js)
  */
  constructor(httpServer, validateToken)
  {
    if(!httpServer)
    {
      throw new Error('Attempt to instantiate WebsocketServer without HttpServer');
    }
    if(!validateToken)
    {
      throw new Error('Attempt to instantiate WebsocketServer without validateToken');
    }
    try
    {
      console.log('[WebsocketServer] httpServer: ' + JSON.stringify(httpServer));
      this.#wsServer = new Ws.Server({ server: httpServer, path: '/' });

      // When client connects
      this.#wsServer.on('connection', (connection, req, client) =>
      {
        console.log('[WebsocketServer] received connection message')

        const id = uuid();
        console.log('[WebsocketServer] Client connected');

        connection.on('open', () => { console.log('[WebsocketServer] Connection opened'); });

        // When client disconnects
        connection.on('close', () =>
        {
          console.log('[WebsocketServer] onClose Client disconnected from close message')
        });

        // When message received from client
        connection.on('message', (message) => this.onMessage(connection, message, validateToken));

        // Error received from client
        connection.on('error', (err) =>
        {
          console.log('[WebsocketServer] ' + err);
        });
      });

      // Monitor for dead connections
      this.startHeartbeat();

      this.#wsServer.on('close', () =>
      {
        console.log('[WebsocketServer] onClose Stopping heartbeat')
        clearInterval(this.#heartbeatInterval);
      });
    }
    catch(err)
    {
      console.log('[WebsocketServer] WebsocketServer error: ' + err + '\nError stack: ' + err.stack);
    }
  }

  sendNotification(userId, notification)
  {
    if(this.#clients[userId])
    {
      console.log('[WebsocketServer] WebsocketServer sending notification to: ' + userId);
      this.#clients[userId].connection.send(JSON.stringify({type: 'notification', notification: notification}));
    }
    else
    {
      console.log('[WebsocketServer] WebsocketServer no active connection for: ' + userId);
    }
  }

  sendGeofenceArea(userId, geofenceArea)
  {
    if(this.#clients[userId])
    {
      console.log('[WebsocketServer] WebsocketServer sending geofencAarea to: ' + userId);
      this.#clients[userId].connection.send(JSON.stringify({ type: 'geofenceArea', geofenceArea: geofenceArea }));
    }
    else
    {
      console.log('[WebsocketServer] WebsocketServer no active connection for: ' + userId);
    }
  }

  sendAnswer(userId, answer)
  {
    if(this.#clients[userId])
    {
      console.log('[WebsocketServer] WebsocketServer sending answer to: ' + userId);
      this.#clients[userId].connection.send(JSON.stringify({type: 'answerAudioCall', answer: answer}));
    }
    else
    {
      console.log('[WebsocketServer] WebsocketServer no active connection for: ' + userId);
    }
  }

  /**
    Decline audio call
  */
  sendDeclineCall(userId, callId)
  {
    if(this.#clients[userId])
    {
      console.log('[WebsocketServer] WebsocketServer sending decline call to: ' + userId);
      this.#clients[userId].connection.send(JSON.stringify({type: 'declineAudioCall', callId: callId}));
    }
    else
    {
      console.log('[WebsocketServer] WebsocketServer no active connection for: ' + userId);
    }
  }

  /**
    Forward ICE candidate
  */
  onIceCandidate(candidate, otherUserId)
  {
    if(this.#clients[otherUserId])
    {
      console.log('[WebsocketServer] WebsocketServer ice candidate to: ' + otherUserId);
      this.#clients[otherUserId].connection.send(JSON.stringify({type: 'onIceCandidate', candidate: candidate}));
    }
    else
    {
      console.log('[WebsocketServer] WebsocketServer no active connection for: ' + otherUserId);
    }
  }

  closeToken(userId) {
    const keys = Object.keys(this.#clients);
    for(let i = 0; i < keys.length; i++)
    {
      console.log(`[WebSocketServer] closeToken: ${userId} for ${JSON.stringify( this.#clients[keys[i]] )}`)
      console.log(`[WebSocketServer] closeToken: ${JSON.stringify(this.#clients[userId] )} }`)
      // If dead kill it
      if(userId === this.#clients[keys[i]] ) {
        console.log(`[WebSocketServer] closeTokening : ${userId}`)
        this.#clients[keys[i]].connection.terminate();
        delete this.#clients[keys[i]];
        console.log(`[WebSocketServer] closeTokening 2 : ${userId}`)
        break
      }
    }  
  }
  
  
  /**
    Starts a continuous loop of pings to keep connections alive
  */
  startHeartbeat()
  {
    console.log(`[WebSocket] starting heartbeat`)

    this.#heartbeatInterval = setInterval(() =>
    {
      const keys = Object.keys(this.#clients);
      for(let i = 0; i < keys.length; i++)
      {
        console.log(`[WebSocketServer] heartbeat token : ${JSON.stringify( this.#clients[keys[i]] )}`)

        // If dead kill it
        if(!this.#clients[keys[i]].isAlive)
        {
          console.log(`[WebSocket] heartbeat killing connection for user: ${JSON.stringify( this.#clients[keys[i]] )}`)
          this.#clients[keys[i]].connection.terminate();
          delete this.#clients[keys[i]];
        }

        else
        {
          // Clear flag and request pong
          this.#clients[keys[i]].isAlive = false;

          // Pong response will contain payload of ping
          const data = JSON.stringify({ type: 'heartbeat', id: keys[i] });
          this.#clients[keys[i]].connection.send(data);
        }
      }
    }, this.#heartbeatIntervalMs);
  }

  /**
    Called when client sends a message,
    parse out the token and save the connection so we can identify users
    @param  {WebsocketConnection} connection  Websocket connection we can interact with
    @param  {String}  strMsg   JSON string containing message data
    @param  {Function} validateToken   Method to validate token (TODO: Figure out why circular depdencies not letting us include Ext in Websocket.js)
    @returns  {Bool}  true on success, false on error
  */
  async onMessage(connection, strMsg, validateToken)
  {
    try
    {
      const msg = JSON.parse(strMsg);
      console.log('[WebsocketServer] onMessage type: ' + msg.type);

      // Identify connection to user
      if(msg.type === 'token')
      {
        console.log('[WebsocketServer] websocket.onMessage(token)');
        if(msg.token !== 'guest')
        {
          const decodedTokenResult = await validateToken(msg.token);
          if(decodedTokenResult.error === null)
          {
            this.#clients[decodedTokenResult.user._id] = {connection: connection, isAlive: true};
            // console.log(decodedTokenResult.user._id + ' is connected: ' + this.#clients[decodedTokenResult.user._id].isAlive);
            console.log(`[WebsocketServer] decodedTokenResult.user._id: ${decodedTokenResult.user._id} is connected: ${this.#clients[decodedTokenResult.user._id].isAlive}`);
          }
        }
      }
      // Keep connection alive
      else if(msg.type === 'heartbeat')
      {
        console.log('[WebsocketServer] websocket.onMessage(heartbeat) client id: ' + msg.id);
        this.#clients[msg.id].isAlive = true;
      }

      // ICE Candidate
      if(msg.type === 'iceCandidate')
      {
        this.onIceCandidate(msg.candidate, msg.otherUserId);
      }

      return true;
    }
    catch(err)
    {
      console.log(err);
      return false;
    }
  }

  isJson(str)
  {
    if(typeof str.replace === 'function')
    {
      return (/^[\],:{}\s]*$/.test(str.replace(/\\["\\\/bfnrtu]/g, '@').
          replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
          replace(/(?:^|:|,)(?:\s*\[)+/g, '')));
    }
    return false;
  }
}

module.exports = WebsocketServer;
