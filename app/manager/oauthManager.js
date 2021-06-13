const Environment = require('../environment');

const { GoogleApis } = require('googleapis');
const Google = new GoogleApis();

const pkceChallenge = require('pkce-challenge');
const Request = require('request');

const MsCredentials = JSON.parse(Environment.MICROSOFT_CREDENTIALS);
const GoogleCredentials = JSON.parse(Environment.GOOGLE_CREDENTIALS);

const MsCalendarUrl = 'https://graph.microsoft.com/v1.0/me/events';

/**
  Singleton that manages the OAuth related authentication
*/
class OauthManager
{
  // MARK: - Data fields
  static #instance = null;
  // Use this one for Google Calendar modifications
  //#googleScopes = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'];
  // Use this one for just login
  #googleScopes = ['email'];
  #microsoftScopes = 'Calendars.ReadWrite offline_access User.Read';
  #oauthClients = new Map();
  #modelMgr = null;

  // MARK: - Constructor
  constructor()
  {
    if(OauthManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of DatabaseManager refused');
    }
  }

  /**
    Initialize manager and save reference to models
  */
  static async Init(modelMgr)
  {
    if(OauthManager.#instance === null)
    {
      OauthManager.#instance = new OauthManager();
      OauthManager.#instance.#modelMgr = modelMgr;
    }
    return OauthManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {DatabaseManager}  Only instance of model manager
  */
  static GetInstance()
  {
    if(OauthManager.#instance === null)
    {
      OauthManager.#instance = new OauthManager();
    }
    if(OauthManager.#instance === null)
    {
      throw new Error('OauthManager not instantiated');
    }
    return OauthManager.#instance;
  }



  /**
    @returns  {OAuth2Client}  Google OAuth2 client
  */
  async googleOAuthClient(userId)
  {
    console.log('[googleOAuthClient] called with ' + userId);

    let client = null;
    let userExists = false;

    // Client exists in memory
    if(this.#oauthClients.has(userId))
    {
      client = this.#oauthClients.get(userId);
      client = client.get('google');
      console.log('Reusing oauth client for ' + userId);
    }
    // Check if we have a token we can create a client from
    else
    {
      console.log('[googleOAuthClient] calling Google.auth.OAuth2 with GoogleCredentials.web.client_id: ' + GoogleCredentials.web.client_id );
      client = new Google.auth.OAuth2(GoogleCredentials.web.client_id,
                                        GoogleCredentials.web.client_secret,
                                        GoogleCredentials.web.redirect_uris[1]);
      let clientMap = new Map();

      console.log('Created Google OAuth client for ' + userId);

      // Token exists
      const mOAuthToken = this.#modelMgr.getModel('oauthtoken');

      // If userId has ':' in it that means we are doing guest login
      let oauthToken = null;
      if(userId.indexOf(':') === -1)
      {
        oauthToken = await mOAuthToken.findOne({ createdBy: userId, source: 'google' });
      }
      if(oauthToken)
      {
        console.log('Found previous Google OAuth token for ' + userId);
        client.setCredentials(oauthToken.token);
      }

      clientMap.set('google', client);
      this.#oauthClients.set(userId, clientMap);
    }
    return client;
  }

  /**
    Returns a oauth URL for Google authentication
  */
  async googleAuthUrl(userId)
  {
    const client = await this.googleOAuthClient(userId);
    const oAuthParams =
    {
      access_type: 'offline',
      scope: this.#googleScopes
    };
    const authUrl = client.generateAuthUrl(oAuthParams);

    return authUrl;
  }

  /**
    Returns a oauth URL for Microsoft authentication
  */
  async microsoftAuthUrl(userId)
  {
    const pkce = pkceChallenge();
    const credentials = JSON.parse(Environment.MICROSOFT_CREDENTIALS);

    const clientId = 'client_id=' + credentials.web.client_id;
    const responseType = 'response_type=code';
    const redirectUri = 'redirect_uri=' + credentials.web.redirect_uris[0];
    const responseMode = 'response_mode=query';
    const scope = 'scope=' + this.#microsoftScopes;
    const state = 'state=microsoft-' + userId;
    const codeChallenge = 'code_challenge=' + pkce.code_challenge;
    const codeChallengeMethod = 'code_challenge_method=S256';

    let authUrl = credentials.web.auth_authority + credentials.web.auth_uri + "?";
    authUrl += clientId;
    authUrl += '&' + responseType;
    authUrl += '&' + redirectUri;
    authUrl += '&' + responseMode;
    authUrl += '&' + scope;
    authUrl += '&' + state;
    authUrl += '&' + codeChallenge;
    authUrl += '&' + codeChallengeMethod;

    authUrl = encodeURI(authUrl);

    if(this.#oauthClients.has(userId))
    {
      let clientMap = this.#oauthClients.get(userId);
      clientMap.set('microsoft', pkce.code_verifier);
      this.#oauthClients.set(userId, clientMap);
    }
    else
    {
      let clientMap = new Map();
      clientMap.set('microsoft', pkce.code_verifier);
      this.#oauthClients.set(userId, clientMap);
    }

    return authUrl;
  }

  /**
    Convert code to token
    @returns {OAuthToken}   Token
  */
  async googleToken(userId, code)
  {
    const client = await this.googleOAuthClient(userId);
    const token = await client.getToken(code);
    client.setCredentials(token.tokens);
    const oauth2 = Google.oauth2({
      auth: client,
      version: 'v2'
    });
    const userInfo = await oauth2.userinfo.get();

    return {token: token.tokens, userInfo: userInfo};
  }

  /**
    Convert code to token
    @returns {OAuthToken}   Token
  */
  async microsoftToken(userId, code)
  {
    const pkce = pkceChallenge();
    const credentials = JSON.parse(Environment.MICROSOFT_CREDENTIALS);

    const clientMap = this.#oauthClients.get(userId);
    const codeVerifier = clientMap.get('microsoft');

    const data =
    {
      "client_id": credentials.web.client_id,
      "scope": this.#microsoftScopes,
      "code": code,
      "redirect_uri": credentials.web.redirect_uris[0],
      "grant_type": 'authorization_code',
      "client_secret": credentials.web.client_secret,
      "code_verifier": codeVerifier
    };

    let options =
    {
      'method': 'POST',
      'url': credentials.web.auth_authority + credentials.web.token_uri,
      'formData': data
    }

    console.log(options);

    const result = await this.doRequest(options);

    return JSON.parse(result);
  }

  /**
    @returns {OAuthToken}   Token
  */
  async refreshMicrosoftToken(userId, token)
  {
    const credentials = JSON.parse(Environment.MICROSOFT_CREDENTIALS);

    const data =
    {
      "client_id": credentials.web.client_id,
      "scope": this.#microsoftScopes,
      "refresh_token": token.refresh_token,
      "redirect_uri": credentials.web.redirect_uris[0],
      "grant_type": 'refresh_token',
      "client_secret": credentials.web.client_secret,
    };

    let options =
    {
      'method': 'POST',
      'url': credentials.web.auth_authority + credentials.web.token_uri,
      'formData': data
    }

    //console.log(options);

    let result = await this.doRequest(options);

    console.log(result);

    result = JSON.parse(result);

    const mOAuthToken = this.#modelMgr.getModel('oauthtoken');
    let msToken = await mOAuthToken.findOne({ source: 'microsoft', createdBy: userId });
    if(msToken)
    {
      msToken.token = result;
      await msToken.save();
    }
    return result;
  }


  // Sync calendar events for user
  async syncEvents(source, userId)
  {
    if(source === 'google')
    {
      return await this.googleEvents(userId);
    }

    else if(source === 'microsoft')
    {
      return await this.microsoftEvents(userId);
    }
  }

  /**
    @returns list of events or -1 if invalid grant
  */
  async googleEvents(userId)
  {
    try
    {
      const client = await this.googleOAuthClient(userId);
      if(!client)
      {
        throw new Error('Could not locate OAuth client for user');
      }

      const calendar = Google.calendar({
        version: 'v3',
        auth: client
      });
      const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime',
      });

      /*if(events.data.items.length > 1)
      {
        console.log(events.data.items[1]);
      }*/
      // Check what events are in the table already
      const mCalendarEvent = this.#modelMgr.getModel('calendarevent');
      const myEvents = await mCalendarEvent.find({ createdBy: userId, source: 'google '}, { createdOn: 1 });

      let createParams = [];
      let found = false;

      let startOn = null;
      let endOn = null;

      // Iterate Google events
      for(let i = 0; i < events.data.items.length; i++)
      {
        found = false;
        // Iterate saved events and see what doesn't exist yet
        for(let j = 0; j < myEvents.length; j++)
        {
          if(myEvents[j].externalId === events.data.items[i].id)
          {
            found = true;
            break;
          }
        }

        if(!found)
        {
          startOn = events.data.items[i].start.date ? events.data.items[i].start.date : events.data.items[i].start.dateTime;
          endOn = events.data.items[i].end.date ? events.data.items[i].end.date : events.data.items[i].end.dateTime;

          createParams.push({
            isDeleted: false,
            createdBy: userId,
            source: 'google',
            calendarId: 'primary',
            externalId: events.data.items[i].id,
            title: events.data.items[i].summary ? events.data.items[i].summary : '',
            description: events.data.items[i].description ? events.data.items[i].description : '',
            location: events.data.items[i].location ? events.data.items[i].location : '',
            startOn: new Date(startOn),
            endOn: new Date(endOn),
            type: 'meeting',
            url: events.data.items[i].htmlLink
          });
        }
      }

      // Batch insert
      await mCalendarEvent.insertMany(createParams);
      return events.data.items;
    }
    catch(err)
    {
      // User rejected app access in Google portal
      if(err.message === 'invalid_grant')
      {
        // Remove oauth token
        const mOAuthToken = this.#modelMgr.getModel('oauthtoken');
        const oauthToken = await mOAuthToken.findOne({ createdBy: userId, source: 'google' });
        await mOAuthToken.delete({ '_id': oauthToken._id });
        return [];
      }
      console.log(err.message);
      console.log(err.stack);
      throw new Error('Could not sync Google calendar events');
    }
  }

  async microsoftEvents(userId)
  {
    try
    {
      const mOAuthToken = this.#modelMgr.getModel('oauthtoken');
      const oAuthToken = await mOAuthToken.findOne({ createdBy: userId, source: 'microsoft' });
      if(!oAuthToken)
      {
        throw new Error('Could not locate OAuth token for user');
      }

      let token = oAuthToken.token.access_token;

      var requestOptions =
      {
        method: 'GET',
        url: MsCalendarUrl,
        headers:
        {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      };

      let events = [];
      try
      {
        events = await this.doRequest(requestOptions);
      }
      catch(err)
      {
        let error = JSON.parse(err);
        if(error.error.code === 'InvalidAuthenticationToken')
        {
          token = await this.refreshMicrosoftToken(userId, oAuthToken.token);
          token = token.access_token;
          requestOptions.headers['Authorization'] = 'Bearer ' + token;
          events = await this.doRequest(requestOptions);
        }
        else
        {
          console.log(err);
          console.log(token);
          throw new Error('Could not refresh Microsoft calendar');
        }
      }
      events = JSON.parse(events);

      // Check what events are in the table already
      const mCalendarEvent = this.#modelMgr.getModel('calendarevent');
      const myEvents = await mCalendarEvent.find({ createdBy: userId, source: 'microsoft '}, { createdOn: 1 });

      let createParams = [];
      let found = false;

      // Iterate Google events
      for(let i = 0; i < events.value.length; i++)
      {
        found = false;
        // Iterate saved events and see what doesn't exist yet
        for(let j = 0; j < myEvents.length; j++)
        {
          if(myEvents[j].externalId === events.value[i].id)
          {
            found = true;
            break;
          }
        }

        if(!found)
        {
          createParams.push({
            isDeleted: false,
            createdBy: userId,
            source: 'microsoft',
            calendarId: 'primary',
            externalId: events.value[i].id,
            title: events.value[i].subject ? events.value[i].subject : '',
            description: events.value[i].bodyPreview ? events.value[i].bodyPreview : '',
            location: events.value[i].location && events.value[i].location.displayName ? events.value[i].location.displayName : '',
            startOn: new Date(events.value[i].start.dateTime),
            endOn: new Date(events.value[i].end.dateTime),
            type: 'meeting',
            url: events.value[i].webLink
          });
        }
      }

      // Batch insert
      await mCalendarEvent.insertMany(createParams);
      return events.values;
    }
    catch(err)
    {
      console.log(err);
      console.log(err.stack);
      throw new Error('Could not sync Microsoft calendar events');
    }
  }

  /**
    Get oauth tokens for user
    @param  {String}  userId  The ID of the user to fetch tokens for
    @returns  {Object}  All tokens for user
  */
  async getTokensForUser(userId)
  {
    const oauthTokens = {};

    // Get OAuth tokens
    const mOAuthToken = this.#modelMgr.getModel('oauthtoken');
    const oAuthTokens = await mOAuthToken.find({ createdBy: userId });

    let googleToken = oAuthTokens.filter(token => token.source === 'google');
    oauthTokens.googleToken = googleToken.length > 0 ? googleToken[0] : null;

    let microsoftToken = oAuthTokens.filter(token => token.source === 'microsoft');
    oauthTokens.microsoftToken = microsoftToken.length > 0 ? microsoftToken[0] : null;

    let appleToken = oAuthTokens.filter(token => token.source === 'apple');
    oauthTokens.appleToken = appleToken.length > 0 ? appleToken[0] : null;

    let facebookToken = oAuthTokens.filter(token => token.source === 'facebook');
    oauthTokens.facebookToken = facebookToken.length > 0 ? facebookToken[0] : null;

    let instagramToken = oAuthTokens.filter(token => token.source === 'instagram');
    oauthTokens.instagramToken = instagramToken.length > 0 ? instagramToken[0] : null;

    return oauthTokens;
  }

  doRequest(options)
  {
    try
    {
      return new Promise(function (resolve, reject)
    	{
        Request(options, function (error, res, body)
    		{
          if (!error && res.statusCode == 200)
    			{
            resolve(body);
          }
    			else
    			{
            if(error === null)
            {
              reject(body);
            }
            else
            {
              reject(error);
            }
          }
        });
      });
    }
    catch(err)
    {
      console.log(err.toString());
      throw err;
    }
  }
}
module.exports = OauthManager;
