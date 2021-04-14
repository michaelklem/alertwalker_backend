// MARK: - Entry point
const Environment   = require('./app/environment');
const Ext 					= require('./app/extension');
const Express 			= require('express');
const
{
  DatabaseManager,
  ModelManager,
  NotificationManager,
  OauthManager,
  ServerManager,
  SiteManager,
  UserManager,
  UtilityManager
} = require('./app/manager');
const Cors 					= require('cors');

// Setup Express app
const app = Express();

// Cors
app.use(Cors());

// Setup routes
app.use('/component',     require('./app/controller/component-controller'));
app.use('/data',          require('./app/controller/data-controller'));
app.use('/location',      require('./app/controller/location-controller'));
app.use('/notification',  require('./app/controller/notification-controller'));
app.use('/oauth',         require('./app/controller/oauth-controller'));
app.use('/push',          require('./app/controller/push-controller'));
app.use('/site',          require('./app/controller/site-controller'));
app.use('/user',          require('./app/controller/user-controller'));

// Limit access / methods / request types
app.all('', async (req, res, next) =>
{
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers',
            "Origin, Accept-Language, X-Requested-With, Content-Type, Accept, Authorization, x-access-token, x-device-id, x-request-source, x-device-service-name, x-device-service-version");
});

const httpServer = app.listen(Environment.PORT);
Ext.print(`HTTP server listening on ${Environment.PORT}`);

// Initialize app
init(httpServer);


/**
  Initialize application
  @param  {HttpServer}  httpServer HTTP server
*/
async function init(httpServer)
{
	// Setup database connection
	const dbMgr = await DatabaseManager.Init();

	// Initiate model manager
	const modelMgr = await ModelManager.Init();
	const mConfiguration = modelMgr.getModel('configuration');

  // Initialize utility manager
  const utilityMgr = await UtilityManager.Init(modelMgr);

	// Initialize site manager
	await SiteManager.Init();

  // Initalize Websocket server
  const serverMgr = await ServerManager.Init(httpServer, async(token) =>
  {
    return await Ext.validateToken(token);
  });

  // Initialize notification manager
  const mNotification = modelMgr.getModel('notification');
  const mSubscribableEvent = modelMgr.getModel('subscribableevent');
  const mEventSubscription = modelMgr.getModel('eventsubscription');
  const notificationMgr = await NotificationManager.Init( mNotification,
                                                          mSubscribableEvent,
                                                          mEventSubscription,
                                                          serverMgr,
                                                          utilityMgr);

  // Initialize oauth manager
  const oauthMgr = await OauthManager.Init(modelMgr);

  // Initialize user manager
  await UserManager.Init(modelMgr, notificationMgr, utilityMgr, oauthMgr, Ext);
}
