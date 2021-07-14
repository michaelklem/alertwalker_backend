const { Emailer,
        Pusher,
        S3 } = require('../utility');

/**
  Singleton that manages the utility services used by site
*/
class UtilityManager
{
  // MARK: - Data fields
  static #instance = null;

  /* Holds all utility classes
    Format: {k: utilityName, v: Utility class} */
  #utilities = null;

  #modelMgr = null;
  #notificationMgr = null;

  // MARK: - Constructor
  constructor()
  {
    if(UtilityManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of UtilityManager refused');
    }
    this.#utilities = new Map();
    this.#utilities.set('emailer', Emailer);
    this.#utilities.set('pusher', Pusher);
    this.#utilities.set('s3', S3);

    console.log('Utility Manager instantiated successfully: true');
  }

  static Init(modelMgr)
  {

    if(UtilityManager.#instance === null)
    {
      UtilityManager.#instance = new UtilityManager();
    }

    // Model manager instantiates utility manager before us
    UtilityManager.#instance.#modelMgr = modelMgr;
    Pusher.Init(modelMgr);
    return UtilityManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {UtilityManager}  Only instance of model manager
  */
  static GetInstance()
  {
    if(UtilityManager.#instance === null)
    {
      UtilityManager.#instance = new UtilityManager();
    }
    return UtilityManager.#instance;
  }


  get(utility)
  {
    return this.#utilities.get(utility);
  }


  setNotificationManager(mgr)
  {
    this.#notificationMgr = mgr;
    Pusher.GetInstance().setNotificationManager(mgr);
  }

}

module.exports = UtilityManager;
