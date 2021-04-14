const Mongo 		  = require('mongoose');
const UtilityManager = require('../manager/utilityManager');
const PointSchema = require('./pointSchema');


/**
  This is the schema for the actual Model object which acts as a wrapper for user created 'models'
*/
/* eslint-disable sort-keys */
const CoreSchema = new Mongo.Schema(
{
  adminPageIcon: { type: String, required: false, maxlength: 32, minlength: 0, lowercase: true, trim: true, unique: false},
  description: 	 { type: String, required: true,  maxlength: 512,  minlength: 0, lowercase: false, trim: false, unique: false},
	name: 	       { type: String, required: true,  maxlength: 64,   minlength: 1, lowercase: true,  trim: true,  unique: true },
  permissions:   { type: Object, required: true },
  schemaFields:  { type: [Mongo.Schema.Types.ObjectId], ref: 'schemaField' },
  tableProperties: { type: Object, required: true }
}, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

// Auto populate the schema fields when doing find/findOne
/* eslint-disable no-invalid-this */
/* eslint-disable func-names */
const autoPopulateRefs = function(next)
{
	this.populate(
  [
    {
      model: 'schemaField',
      path: 'schemaFields'
    }
  ]);
	next();
};
CoreSchema.pre('findOne', autoPopulateRefs);
CoreSchema.pre('find',    autoPopulateRefs);
// Make sure we don't save invalid model name or anything dumb
const validatePreSave = function(next)
{
  if(this.name === undefined || this.name === 'undefined' || this.name === null)
  {
    next(new Error('Invalid model name'));
  }
  next();
};
CoreSchema.pre('save', validatePreSave);
/* eslint-enable no-invalid-this */
/* eslint-enable func-names */


/**
  Collections used to represent real world objects that.
  Acts as a wrapper for the Mongo collection
*/
class Model
{
  // MARK; - Data fields
  static CoreModel = Mongo.model('Model', CoreSchema);

  // Default scheam fields that get added to every model
  static DefaultSchemaFields =
  [
    {
      autoPopulate: false,
      defaultValue: false,
      isArray: false,
      keyInReference: '',
      lowercase: false,
      managedUpdateForm: false,
      maxLength: -1,
      minLength: -1,
      name: 'isDeleted',
      reference: '',
      required: true,
      trim: false,
      type: 'boolean',
      unique: false
    },
    {
      autoPopulate: true,
      defaultValue: '_current_user_',
      isArray: false,
      keyInReference: 'username',
      lowercase: false,
      managedUpdateForm: false,
      maxLength: -1,
      minLength: -1,
      name: 'createdBy',
      reference: 'user',
      required: false,
      trim: false,
      type: "reference",
      unique: false,
      label: ""
    }
  ];

  // Default table properties
  static DefaultTableProps =
  {
    "headers":
    [
      {
        "id": "_id",
        "filter": true,
        "label": "ID"
      }
    ],
    "defaultSort": "_id",
    "showInDataManager": false,
    "icon": "ti-lock"
  };

  // Default permission properties
  static DefaultPermissionProps =
  {
    "create":
    [
      "admin",
      "system"
    ],
    "delete":
    [
      "admin",
      "system"
    ],
    "query":
    [
      "admin",
      "system",
      "owner"
    ],
    "update":
    [
      "admin",
      "system",
      "owner"
    ]
  };

  // For S3 upload
  #awsConfig = null;

  // Name of model
  name = null;

  // Mongo.document ._id
  #mongoDocId = null;

  // Mongo.model
  #mongoModel = null;

  // Mongo.Schema
  #mongoSchema = null;

  // Array.<ModelPermission> that can update this model
  #updatePermission = null;
  // Array.<ModelPermission> that can query this model
  #queryPermission = null;
  // Array.<ModelPermission> that can delete this model
  #deletePermission = null;
  // Array.<ModelPermission> that can create this model
  #createPermission = null;

  /* eslint-enable sort-keys */
  // MARK: - Constructor
  /**
    Create Mongo.model from schema fields
    @param  {Mongo.document}  modelDoc    Document representing this model and it's schema
  */
  constructor(modelDoc)
  {
    try
    {
      console.log('Model(' + modelDoc.name + ')');
      this.name = modelDoc.name;
      this.#mongoDocId = modelDoc._id.toString();

      let schemaFieldsToGeospatialIndex = [];

      // Convert JSON schema fields to actual Mongo schema
      const schemaParams = {};
			for(let i = 0; i < modelDoc.schemaFields.length; i++)
      {
				// Convert to JSON we can pass to Mongo.Schema
        schemaParams[modelDoc.schemaFields[i].name] = this.toMongoSchema(modelDoc.schemaFields[i]);

        // Check if we contain any coordinate points, if so we will create index on location for geospatial queries
        if(modelDoc.schemaFields[i].type === 'point')
        {
          schemaFieldsToGeospatialIndex.push(modelDoc.schemaFields[i].name);
        }
			}

			// Construct schema and Mongo base model
      this.#mongoSchema = new Mongo.Schema(schemaParams, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

      /* Don't setup auto reference on find because there are cases we don't want that
      find by default will auto populate references that it needs to
      there is findNoPopulate if you don't want to populate */
      this.#mongoSchema.pre('findOne',  this.populateAutoReferenceFields);
      this.#mongoSchema.pre('findById', this.populateAutoReferenceFields);

      // Setup geospatial indexes
      if(schemaFieldsToGeospatialIndex.length > 0)
      {
        for(let i = 0; i < schemaFieldsToGeospatialIndex.length; i++)
        {
          this.#mongoSchema.index({ [schemaFieldsToGeospatialIndex[i]]: '2dsphere' });
          console.log('Created geospatial index on: ' + schemaFieldsToGeospatialIndex[i]);
        }
      }

      this.#mongoModel = Mongo.model(this.name, this.#mongoSchema);
    }
    catch(err)
    {
      console.log(err.stack);
    }
  }


  // MARK: - Mongo Document Manipulation
  /**
    Perform aggregate query
    @param 	{JSON} 	data		JSON formatted params
    @returns {Mongo.document} 	Newly created document
  */
  async aggregate(params)
  {
    const obj = await this.#mongoModel.aggregate(params);
    return obj;
  }


  /**
    Create new document
    @param 	{JSON} 	data		JSON formatted params
    @param  {User?} user  Optional user calling this method for record keeping
  	@returns {Mongo.document} 	Newly created document
  */
  async create(data, user)
  {
    let obj = null;
    const params = data;

    //console.log('Create params');
    //console.log(params);
    // Fill in default schema fields
    for(let i = 0; i < Model.DefaultSchemaFields.length; i++)
    {
      // _current_user_ will use the current signed in user
      if(Model.DefaultSchemaFields[i].defaultValue === '_current_user_')
      {
        if(!user)
        {
          // Check if there is a schema field for this schemaField name (createdBy)
          // otherwise we don't need a user and can still create the document
          let mustHaveUserField = false;
          const coreDoc = await this.getCoreDocument();
          for(let j = 0; j < coreDoc.schemaFields.length; j++)
          {
            if(coreDoc.schemaFields[j].name === Model.DefaultSchemaFields[i].name)
            {
              if(Model.DefaultSchemaFields[i].required)
              {
                mustHaveUserField = true;
              }
              break;
            }
          }

          if(mustHaveUserField)
          {
            throw new Error('Missing user');
          }
        }
        else
        {
          params[Model.DefaultSchemaFields[i].name] = user._id;
        }
      }
      // Otherwise use supplied default value
      else
      {
        params[Model.DefaultSchemaFields[i].name] = Model.DefaultSchemaFields[i].defaultValue;
      }
    }

    /* SiteManager.requestFieldsToPageValues will give secure fields unhashed and hashed
        so make sure we get rid of that and only save the hashed   */
    const keys = Object.keys(params);
    //console.log(keys);
    //console.log(params);
    for(let i = 0; i < keys.length; i++)
    {
      if(params[keys[i]] && params[keys[i]].hashed && params[keys[i]].unhashed)
      {
        params[keys[i]] = params[keys[i]].hashed;
      }
    }

    obj = await this.#mongoModel.create(params);

    // Populate auto ref fields
	  obj = await this.findOne({_id: obj._id});

    return obj;
  }

  /**
    Create new document as is without modifying fields at all
    @param 	{JSON} 	data		JSON formatted params
    @returns {Mongo.document} 	Newly created document
  */
  async createAsIs(data)
  {
    let obj = await this.#mongoModel.create(data);

    // Populate auto ref fields
	  obj = await this.findOne({_id: obj._id});
    return obj;
  }

  /**
    Delete documents
    @param  {JSON}  params    JSON formatted params to filter on for deletion
    @returns  {JSON}  {n: Matched documents, ok: 1(success), deletedCount: deleted documents}
    or Error if object has committments preventing it from being deleted
  */
  async delete(params)
	{
		try
		{
			// Look up objects
			const objects = await this.find(params);
			let reason = '';

			// Iterate objects
			for(let i = 0; i < objects.length; i++)
			{
				/* If any of the objects can not be deleted,
				   throw error and do not delete any */
				reason = this.reasonToNotDelete(objects[i]);
				if(reason.length > 0)
				{
					throw new Error(reason);
				}
			}

			// If we reach here we're ok to delete
			const result 	= await this.#mongoModel.deleteMany(params).exec();
			return result;
		}
		catch(err)
		{
			console.log(err);
			throw err;
		}
	}

  // TODO: Add default option to remove secure fields unless specified by param
  /**
    Find many documents
    @param 	{JSON} 		params  	JSON params to filter on
    @param  {JSON}    sort      Sort filter to apply
    @param  {String}  select    Space separated list of fields to select from the result set
    @note   select has a default value of "*" which means to select all fields
    @returns {Array.<Mongo.document>?} array or null if not found
  */
  async find(params, sort = {_id: 1}, select = '*')
  {
    try
    {
      let results = null;
      const autoPopulateFields = await this.buildAutoPopulateReferenceQuery();
      if(autoPopulateFields.length > 0)
      {
        if(select !== '*')
        {
          results = await this.#mongoModel.find(params).populate(autoPopulateFields).sort(sort).select(select).exec();
        }
        else
        {
          results = await this.#mongoModel.find(params).populate(autoPopulateFields).sort(sort).exec();
        }
      }
      else
      {
        if(select !== '*')
        {
          results = await this.#mongoModel.find(params).sort(sort).select(select).exec();
        }
        else
        {
          results = await this.#mongoModel.find(params).sort(sort).exec();
        }
      }

      return results;
    }
    catch(err)
    {
      console.log(err.message);
      throw err;
    }
  }



    /**
      Find many documents and skip populating
      @param 	{JSON} 		params  	JSON params to filter on
      @param  {JSON}    sort      Sort filter to apply
      @returns {Array.<Mongo.document>?} array or null if not found
    */
    async findNoPopulate(params, sort = {_id: 1})
    {
      try
      {
        const results = await this.#mongoModel.find(params).sort(sort).exec();
        //console.log(results);
        return results;
      }
      catch(err)
      {
        console.log(err.message);
        throw err;
      }
    }


  /**
    Find one document
    @param 	  {JSON}  params  	JSON params to filter on
    @param  {String}  select    Space separated list of fields to select from the result set
    @note   select has a default value of "*" which means to select all fields
    @returns  {Mongo.document?} document or null if not found
   */
   // TODO Swap order of select/sort to keep things correctly formatted like find() is
	async findOne(params, select = '*', sort = { createdOn: 1 })
	{
		try
		{
      let doc = null;
      if(select !== '*')
      {
        doc = doc = await this.#mongoModel.findOne(params).sort(sort).select(select).exec();
      }
      else
      {
        doc = await this.#mongoModel.findOne(params).sort().exec();
      }
      return doc;
		}
		catch(err)
		{
			console.log(err.message);
			throw err;
		}
	}

  /**
    Find a document with specified ID
    @param 	  {String}  id  	Unique identifier for document
    @returns  {Mongo.document?}   object or null if not found
   */
  async forId(id)
  {
    try
    {
      //console.log('Searching for model with id: ' + id);
      const doc = await this.#mongoModel.findById(id).exec();
      if(!doc)
      {
        return null;
      }
      return doc;
    }
    catch(err)
    {
      console.log(err.message);
      throw err;
    }
  }

  /**
    Batch create
    @param 	  {Array.<JSON>}  paramArray  	Array of create params
    @returns  {Bool}  true|false if it succeceeded
   */
  async insertMany(paramArray)
  {
    try
    {
      //console.log('Searching for model with id: ' + id);
      const results = await this.#mongoModel.insertMany(paramArray);
      //console.log(results);
      return true;
    }
    catch(err)
    {
      console.log(err.message);
      throw err;
    }
  }

  /**
    Get the core model document
    @returns  {Mongo.document}  Core model document
  */
  async getCoreDocument()
  {
    const doc = await Model.CoreModel.findOne({_id: this.#mongoDocId}).exec();
    return doc;
  }

  /**
		Determine if this document has any commitments or can be deleted
    @param   {Mongo.document}   doc  Document to be deleted
		@returns {String}	Empty string if no error, or error message if error
	*/
	async reasonToNotDelete(doc)
	{
		/* TODO: Lookup up-coming classes for this user
		const classes = await Class.Find({ instructor: object.id, status: 'coming-up', time: { $gte: new Date() } });
		if(classes.length > 0)
		{
			return ('(' + doc.id + ') can not be deleted due to an up coming class that is scheduled (' + classes[0].location + ')');
		} */
		return '';
	}


  /**
    Update core model document
    @param  {JSON}  params  {k: id, v: value} fields to update in document
    @returns {Bool} true on success or false if error
  */
  async updateCore(params)
  {
    try
    {
      const doc = await this.getCoreDocument();
      Object.keys(params).forEach((key) =>
      {
        doc[key] = params[key];
      });
      await doc.save();
      return true;
    }
    catch(err)
    {
      console.log(err);
      return false;
    }
  }

  /**
    Update documents for particular object by ID
    @param  {String}  id    Object ID of document to update
    @param  {JSON}  params  {k: id, v: value} fields to update in document
    @returns {Mongo.document} Updated document on success or exception if issue
  */
  async updateById(id, params)
  {
    try
    {
      // Need to validate against schema fields
      const coreDoc = await this.getCoreDocument();

      /* Old files overwritten by new ones
        well remove them after successful save */
      const filesToRemove = [];

      let doc = await this.forId(id);

      // Need to know if we are removing a file
      let isFileType = false;
      Object.keys(params).forEach((key) =>
      {
        isFileType = false;

        // Validate field
        const isValid = this.validateFieldChange(key, params[key], coreDoc);
        if(!isValid)
        {
          throw new Error('Field ' + key + ' violates model schema');
        }

        /* Find schema field for param and if file type then we need to remove
           old file from S3 to keep storage costs down ^_^ */
        for(let i = 0; i < coreDoc.schemaFields.length; i++)
        {
          if(coreDoc.schemaFields[i].name === key)
          {
            if(coreDoc.schemaFields[i].type === 'file')
            {
              filesToRemove.push(doc[key]);
              isFileType = true;
            }
            break;
          }
        }

        // If file type and specified to remove it set it to null
        if(isFileType && params[key] === '_delete_file_')
        {
          doc[key] = null;
        }
        else
        {
          doc[key] = params[key];
        }
      });
      await doc.save();

      // Remove old files from S3
      //const bucketName = await Helper.getValueForConfig('AWS_S3_BUCKET');
      //await UtilityManager.GetInstance().get('s3').DeleteMany(filesToRemove, bucketName);
      // ModelManager.convertFormFieldsToJsonParams will set the user field to be the userId of the user requesting an update
      // requery the document so we can auto populate the user field if need be
      // might actually want to keep this just to handle populating all reference fields if schemaField definition says to
      doc = await this.forId(id)
      return doc;
    }
    catch(err)
    {
      console.log(err);
      return false;
    }
  }


  /**
    Update many documents
    @param  {JSON}  filterQuery    JSON parameters to filter on (documents matching this get updated)
    @param  {Array.<JSON>}  fieldValues Contains fields to update and their new value
    {field: fieldName, value: newValue}
    @returns {Int} Documents updated
  */
  async updateMany(filterQuery, fieldValues)
  {
    try
    {
      /*
        TODO: Add schema field validation on changes
        and remove files if updating file fields
      */
      const result = await this.#mongoModel.updateMany(filterQuery, fieldValues).exec();
      return result.nModified;
    }
    catch(err)
    {
      console.log(err);
      return false;
    }
  }

  /**
    Upsert
    @param  {JSON}  filterQuery    JSON parameters to filter on (documents matching this get updated)
    @param  {JSON}  updateQuery Updates to apply
    @returns {Mongo.Document} Newly created or updated document
  */
  async upsert(filterQuery, updateQuery)
  {
    try
    {
      const params =
      {
        new: true,
        upsert: true
      };
      const result = await this.#mongoModel.findOneAndUpdate(filterQuery, updateQuery, params).exec();
      return result;
    }
    catch(err)
    {
      console.log(err);
      return false;
    }
  }

  /**
    Check if a particular user can perform an action on model
    @param  {String}  action  The action to perform (create|delete|query|update)
    @param  {User}  user    The user attempting to perform the action
    @param  {String?}  id  The ID of the document being acted on (Optional)
    @returns  {Bool}  true on success|false on rejected
  */
  async canPerformAction(action, user, id = '')
  {
    try
    {
      const coreDoc = await this.getCoreDocument();
      // Check authorization type and any
      if(coreDoc.permissions[action].indexOf(user.authorization.type) === -1 &&
          coreDoc.permissions[action].indexOf('any') === -1)
      {
        if(!id)
        {
          return false;
        }

        // Check if owner allowed
        if(coreDoc.permissions[action].indexOf('owner') === -1)
        {
          return false;
        }
        // Check if we are owner
        const modelDoc = await this.forId(id);
        if(!modelDoc || !modelDoc.createdBy)
        {
          // Check if the model type is user (User does not have a created by as they create themselves)
          if(modelDoc && this.name === 'user')
          {
            // If document being updated is this user's user record they can update it
            // TODO: Add logic to prevnent a user from updating their authorization type unless they are admin
            // otherwise that will be embarassing
            return (modelDoc._id.toString() === user._id.toString());
          }

          return false;
        }
        if(modelDoc.createdBy._id.toString() !== user._id.toString())
        {
          return false;
        }

        return true;
      }
      return true;
    }
    catch(err)
    {
      return false;
    }
  }


  /**
    Build query of reference fields in the schema with auto populate set to true
    to auto populate, best used on find() to populate array of results
    @returns {Array.<String>} Array of fields to populate
  */
  async buildAutoPopulateReferenceQuery()
  {
    try
    {
      const coreDoc = await this.getCoreDocument();
      const populateQuery = [];
      // Auto populate any reference fields with autopopulate=true
  		for(let i = 0; i < coreDoc.schemaFields.length; i++)
  		{
  			if(coreDoc.schemaFields[i].type === 'reference')
  			{
  				if(coreDoc.schemaFields[i].autoPopulate)
          {
            populateQuery.push({path: coreDoc.schemaFields[i].name, model: coreDoc.schemaFields[i].reference});
  				}
  			}
  		}
      return populateQuery;
    }
    catch(err)
    {
      console.log(this.#mongoModel);
      console.log('Could not find core document for model: ' + this.name + ' with ID: ' + this.#mongoDocId);
      console.log('Model<' + this.name + '>.buildAutoPopulateReferenceQuery()' + err.message + '\nStack: \n' + err.stack);
      throw err;
    }
  }

  async forcePopulateById(_id, populateFields)
  {
     return await this.#mongoModel.findOne({ _id: _id }).populate(populateFields).exec();
  }

  /**
    Setup pre-populate on find and findOne queries
    will check all schema fields for auto populate references
  */
  populateAutoReferenceFields(next)
  {
    // TODO: Autopopulate sub documents as well

    // TODO: Remove secure fields from auto populated
    // Query CoreModel for {name: schemaFields[i]].options.ref}
    // Iterate it's SchemaFields and build select fields clause and exclude secure
    // https://stackoverflow.com/a/12100808

    // TODO: Add a check to the query object to see what fields were selected,
    // then we can skip populating fields that aren't selected
    // and handle removing fields that weren't selected
    // Get all schema fields
    const schemaFields = Object.keys(this.schema.paths);

    // Auto populate any reference fields with autopopulate=true
    const populateQuery = [];
    for(let i = 0; i < schemaFields.length; i++)
    {
      // If this is an reference field and not our object ID
      if(schemaFields[i] !== '_id' &&
          (this.schema.paths[schemaFields[i]].options.type === Mongo.Schema.Types.ObjectId ||
          this.schema.paths[schemaFields[i]].options.type === [Mongo.Schema.Types.ObjectId] || // Pretty sure this line of code doesn't work
          (Array.isArray(this.schema.paths[schemaFields[i]].options.type) && this.schema.paths[schemaFields[i]].options.type[0] === Mongo.Schema.Types.ObjectId))) // But this one does
      {
        // And it's an auto populate field lets populate it
        //console.log(this.schema.paths[schemaFields[i]].options);
        //console.log('Auto populate: ' + this.schema.paths[schemaFields[i]].options.autoPopulate + '\nReference: ' + this.schema.paths[schemaFields[i]].options.ref + "\nField: " + schemaFields[i]);
        if(this.schema.paths[schemaFields[i]].options.autoPopulate && this.schema.paths[schemaFields[i]].options.ref)
        {
          populateQuery.push({path: schemaFields[i], model: this.schema.paths[schemaFields[i]].options.ref});
        }
      }
    }

    this.populate(populateQuery);
    next();
  };



  /**
    Validate field exists in schema and proposed value doesn't
    violate schema
    @param  {String}  field           Field to change
    @param  {Any}    proposedChange  Proposed change
    @param  {Mongo.document}  coreDoc   Mongo document to validate against (so we don't have to make this method async)
    @returns {JSON}  valid: true/false (true if change is valid or false if violates schema), requiresUpload: true/false (if it is a file type)
  */
  validateFieldChange(field, proposedChange, coreDoc)
  {
    // Auto populate any reference fields with autopopulate=true
		for(let i = 0; i < coreDoc.schemaFields.length; i++)
		{
			if(coreDoc.schemaFields[i].name === field)
			{
        /* TODO: Add schema validation
          right now it's just checking to make sure field exists */
        return true;
			}
		}
    //console.log('model.validateFieldChange(' + field + ', ' + proposedChange.toString() + ') invalid');
    // If we reach here we didn't find the field
    return false;
  }


  /**
    Create new core model document and populate reference fields
    @param 	{JSON} 	data		JSON formatted params
  	@returns {Mongo.document} 	Newly created document
  */
  static async CreateAndPopulateCoreDoc(data)
  {
    // Create
    let coreModelDoc = await Model.CoreModel.create(data);
    // Populate
    coreModelDoc = await Model.CoreModel.findOne({_id: coreModelDoc._id});
    return coreModelDoc;
  }


  /**
    Convert a SchemaField Mongo.document to a JSON object we can pass to the Mongo.Schema function
    @param  {Mongo.document}   doc 	Mongo.document of SchemaField
    @returns  {JSON}  Formatted JSON Object that can be passed ot Mongo.Schema function
  */
  // TODO: I am disabling indexing on 1024 characters or more because it's too much to index
  // look into how to add text index
  toMongoSchema(doc)
  {
    switch(doc.type)
    {
      case 'string':
      return {
        type: (doc.isArray === true ? [String] : String),
        required: doc.required,
        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        lowercase: doc.lowercase,
        trim: doc.trim,
        unique: doc.unique,
        index: doc.maxLength === -1 || doc.maxLength > 1024 ? false : true,

        reference: '',
        autoPopulate: false
      };

      case 'select':
      return {
        type: (doc.isArray === true ? [String] : String),
        required: doc.required,
        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        lowercase: doc.lowercase,
        trim: doc.trim,
        unique: doc.unique,
        values: doc.values,

        reference: '',
        autoPopulate: false
      };

      case 'secure':
      return {
        type: (doc.isArray === true ? [String] : String),
        required: doc.required,
        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        lowercase: doc.lowercase,
        trim: doc.trim,
        unique: doc.unique,

        reference: '',
        autoPopulate: false
      };

      case 'number':
      return {
        type: (doc.isArray === true ? [Number] : Number),
        required: doc.required,
        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        unique: doc.unique,

        lowercase: false,
        trim: false,
        reference: '',
        autoPopulate: false
      };

      case 'file':
      return {
        type: (doc.isArray === true ? [String] : String),
        required: doc.required,
        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        lowercase: doc.lowercase,
        trim: doc.trim,
        unique: doc.unique,

        reference: '',
        autoPopulate: false
      };

      case 'boolean':
      return {
        type: (doc.isArray === true ? [Boolean] : Boolean),
        required: doc.required,

        unique: false,
        reference: '',
        autoPopulate: false
      };

      case 'reference':
      return {
        type: (doc.isArray === true ? [Mongo.Schema.Types.ObjectId] : Mongo.Schema.Types.ObjectId),
        ref: doc.reference,
        autoPopulate: doc.autoPopulate,
        required: doc.required
      };

      case 'object':
      return {
        type: (doc.isArray === true ? [Object] : Object),
        required: doc.required,

        maxlength: (doc.maxLength === -1 ? 9999999999999 : doc.maxLength),
        minlength: (doc.minLength === -1 ? -9999999999999 : doc.minLength),
        unique: false,
        reference: '',
        autoPopulate: false,
        index: doc.maxLength === -1 || doc.maxLength > 1024 ? false : true,
      };

      case 'datetime':
      return {
        type: (doc.isArray === true ? [Object] : Object),
        required: doc.required,

        unique: false,
        reference: '',
        autoPopulate: false
      };

      case 'date':
      return {
        type: (doc.isArray === true ? [Object] : Object),
        required: doc.required,

        unique: false,
        reference: '',
        autoPopulate: false
      };


      case 'point':
      return {
        type: (doc.isArray === true ? [PointSchema] : PointSchema),
        required: doc.required,

        minlength: 3,
        maxlength: 9999999999999,
        unique: false,
        reference: '',
        autoPopulate: false
      };

      default:
        throw new Error('Unsupported schema type {' + doc.type + '}');
    }
  }
}
module.exports = Model;
