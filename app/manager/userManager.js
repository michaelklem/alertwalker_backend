const BCrypt 		= require('bcryptjs');
const Environment 		= require('../environment');
const appleSigninAuth = require('apple-signin-auth');
const {Log}		= require('../model');

/**
  Singleton that manages the user functionality
*/
class UserManager
{
  // MARK: - Data fields
  static #instance = null;
  #modelMgr = null;
  #notificationMgr = null;
  #utilityMgr = null;
  #oauthMgr = null;
  #ext = null;

  // MARK: - Constructor
  constructor()
  {
    if(UserManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of UserManager refused');
    }

    console.log('User Manager instantiated successfully: true');
  }

  static Init(modelMgr, notificationMgr, utilityMgr, oauthMgr, ext)
  {

    if(UserManager.#instance === null)
    {
      UserManager.#instance = new UserManager();
    }

    // Model manager instantiates utility manager before us
    UserManager.#instance.#modelMgr = modelMgr;
    UserManager.#instance.#notificationMgr = notificationMgr;
    UserManager.#instance.#utilityMgr = utilityMgr;
    UserManager.#instance.#oauthMgr = oauthMgr;
    UserManager.#instance.#ext = ext;
    return UserManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {UserManager}  Only instance of user manager
  */
  static GetInstance()
  {
    if(UserManager.#instance === null)
    {
      UserManager.#instance = new UserManager();
    }
    return UserManager.#instance;
  }

  async login({ email,
                source,
                accessToken,
                firstName,
                lastName,
                photo,
                url,
                externalId,
                deviceId,
                requestSource,
                deviceServiceName,
                password,
                thirdPartyAccount })
  {
    const mAuthorization = this.#modelMgr.getModel('authorization');
		const mEventSubscription = this.#modelMgr.getModel('eventsubscription');
		const mSubscribableEvent = this.#modelMgr.getModel('subscribableevent');
		const mUser = this.#modelMgr.getModel('user');
		const mVerification = this.#modelMgr.getModel('verification');
		const mConfiguration = this.#modelMgr.getModel('configuration');
		const mOauthToken = this.#modelMgr.getModel('oauthtoken');
    const mThirdPartyAccount = this.#modelMgr.getModel('thirdpartyaccount');
		const mInviteCode = this.#modelMgr.getModel('invitecode');

    let user = null;

    // Apple doesn't send us email on every API call (only first one)
    if(thirdPartyAccount && (thirdPartyAccount.source === 'apple' || thirdPartyAccount.createdBy))
    {
      user = thirdPartyAccount.createdBy;
    }
    // Otherwise use email
    else
    {
      user = await mUser.findOne({ email: email.toLowerCase() });
    }

    if(user === null || user === undefined)
    {
      //await Log.Error(__filename, "Invalid login attempt for " + JSON.stringify(req.body) + " (1)");
      return { error: "Could not find a matching user with that information" };
    }

    if(!password)
    {
      // Update fields from third party source
      // Apple doesn't send us all the info we need on subsequent login
      if(source !== 'apple')
      {
        user.firstName = firstName;
        user.lastName = lastName;
        user.photo = photo;
        await user.save();
      }

      // Remove password from output and other unnecessary fields
      user = await mUser.findOne({_id: user._id}, this.#modelMgr.getUserSelectFields());
      if(user === undefined)
      {
        //await Log.Error(__filename, '{ERR_1}-Unknown error during user registration');
        return { error: 'Unknown error' };
      }
    }

    // Check password
    else
    {
      const result = await BCrypt.compare(password, user.password);
      if(!result && password !== 'seeuDWE47QVj4sUsF26z3mB3fMpYCxwrJFqSFX3zDwWB2PNqnk') // Added way to bypass password for debugging user account
      {
        //await Log.Error(__filename, "Invalid login attempt for " + JSON.stringify(user.email) + "(2)");
        return { error: "Could not find a matching user with that information" };
      }
    }

    // Save oauth token
    let oAuthToken = null;
    if(accessToken)
    {
      oAuthToken = await mOauthToken.findOne({ source: source, createdBy: user._id });
      if(oAuthToken)
      {
        oAuthToken.token = accessToken;
        await oAuthToken.save();
      }
      else
      {
        oAuthToken = await mOauthToken.create({ token: accessToken, source: source }, user);
      }
    }

    // API token
    const tokenResult = await this.#ext.createTokenForUser(user._id, deviceId);
    if(tokenResult.error !== null)
    {
      return { error: tokenResult.error };
    }

    /*
      If mobile query pushtoken to see if any matching device-id but no user field
      then update with user ID
    */
    if(requestSource === 'mobile')
    {
      const pushToken = await this.#utilityMgr.get('pusher').FixOrphanToken(	user._id,
                                                                              deviceServiceName,
                                                                              deviceId);
    }

    // Clear password
    user = JSON.parse(JSON.stringify(user));
    delete user.password;

    // Return all oauth tokens for user
    const oauthTokens = await this.#oauthMgr.getTokensForUser(user._id);

    // Keep third party accounts in sync with app manager too
    const thirdPartyAccounts = await mThirdPartyAccount.find({ createdBy: user._id });

    return {
      error: null,
      user: user,
      thirdPartyAccounts: thirdPartyAccounts,
      oauthTokens: oauthTokens,
      tokenResult: tokenResult,
    };
  }

  async register({  email,
                    source,
                    accessToken,
                    firstName,
                    lastName,
                    photo,
                    url,
                    externalId,
                    deviceId,
                    requestSource,
                    deviceServiceName })
  {
    const mAuthorization = this.#modelMgr.getModel('authorization');
		const mEventSubscription = this.#modelMgr.getModel('eventsubscription');
		const mSubscribableEvent = this.#modelMgr.getModel('subscribableevent');
		const mUser = this.#modelMgr.getModel('user');
		const mVerification = this.#modelMgr.getModel('verification');
		const mConfiguration = this.#modelMgr.getModel('configuration');
		const mOauthToken = this.#modelMgr.getModel('oauthtoken');
    const mThirdPartyAccount = this.#modelMgr.getModel('thirdpartyaccount');

    // Generate random password
    const password = this.#ext.randomIntFromInterval(0, 9999999999999);
    const hashed = await BCrypt.hash(password, 8);

    // Get authorization type for customer
    const customerAuth = await mAuthorization.findOne({ type: 'customer' });
    if(!customerAuth)
    {
      return { error: "Customer authorization type missing" };
    }

    // I bypass this check on top for Apple login, so adding it here to be safe (since it's registration)
    if(!email)
    {
      console.log('Email param error 2');

      // Apple can be dumb and sometimes not give us the email
      if(source === 'apple')
      {
        let appleIdTokenClaims = await appleSigninAuth.verifyIdToken(accessToken, {} );

        if(appleIdTokenClaims.email)
        {
          email = appleIdTokenClaims.email;
        }
      }
    }

    // If still not email then something went bad
    if(!email)
    {
      return { error: "Missing email parameter" };
    }

    // Check if this user already has an account to merge with
    let user = await mUser.findOne({ username: email }, this.#modelMgr.getUserSelectFields());
    let alreadyRegistered = false;
    if(user)
    {
      alreadyRegistered = true;
    }

    // Create user
    const userParams =
    {
      username: email,
      email: email.toLowerCase(),
      password: {hashed: hashed, unhashed: password},
      phone: '',
      authorization: customerAuth._id,
      firstName: firstName,
      photo: photo,
      lastName: lastName,
      birthdate: '',
      gender: ''
    };
    if(!alreadyRegistered)
    {
      user = await mUser.create(userParams);
    }

    // Create third party account
    let thirdPartyAccountParams = { source: source, externalId: externalId };
    thirdPartyAccountParams.url = url;
    let thirdPartyAccount = await mThirdPartyAccount.create(thirdPartyAccountParams, user);
    if(!thirdPartyAccount)
    {
      await Log.Error(__filename, '{ERR_1}-Unknown error during user registration');
      return { error: 'Unknown error' };
    }

    // Save oauth token
    const oAuthToken = await mOauthToken.create({ token: accessToken, source: source }, user);

    // Remove password from output and other unnecessary fields
    user = await mUser.findOne({_id: user._id}, this.#modelMgr.getUserSelectFields());
    if(user === undefined)
    {
      await Log.Error(__filename, '{ERR_1}-Unknown error during user registration');
      return { error: 'Unknown error' };
    }

    // API token
    const tokenResult = await this.#ext.createTokenForUser(user._id, deviceId);
    if(tokenResult.error !== null)
    {
      return { error: tokenResult.error };
    }

    /*
      If mobile query pushtoken to see if any matching device-id but no user field
      then update with user ID
    */
    if(requestSource === 'mobile')
    {
      const pushToken = await this.#utilityMgr.get('pusher').FixOrphanToken(	user._id,
                                                                                          deviceServiceName,
                                                                                          deviceId);
    }

    if(!alreadyRegistered)
    {
      // Subscribe user to all system event notifications and push notifications
      this.#notificationMgr.subscribeUserToEvents({ openTo: customerAuth._id, user: user });
    }

    const oauthTokens =
    {
      [oAuthToken.source + 'Token']: oAuthToken
    };

    // Keep third party accounts in sync with app manager too
    const thirdPartyAccounts = await mThirdPartyAccount.find({ createdBy: user._id });

    return {
      error: null,
      user: user,
      thirdPartyAccounts: thirdPartyAccounts,
      oauthTokens: oauthTokens,
      tokenResult: tokenResult,
    };
  }
}

module.exports = UserManager;
