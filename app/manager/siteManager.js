const BCrypt 		= require('bcryptjs');
const ModelManager = require('./modelManager');
const Mongo = require('mongoose');

/**
  Singleton that manages the sites styles and other settings
*/
class SiteManager
{
  // MARK: - Data fields
  static #instance = null;

  /* Holds components of the frontend/mobile and their associated fields/styles.
    Format: {k: component.name, v: Model.component} */
  #components = null;

  // Name of the frontend to display
  #frontendTitle = '';

  // Internal form input types that are not schema fields
  #internalTypes = ['button', '_remember_me_', '_confirm_'];

  // MARK: - Constructor
  constructor()
  {
    if(SiteManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of SiteManager refused');
    }
    this.#components = new Map();
  }

  /**
    Singleton accessor
    @returns {SiteManager} Only instance of model manager
  */
  static async Init()
  {
    if(SiteManager.#instance === null)
    {
      SiteManager.#instance = new SiteManager();
      await SiteManager.#instance.initializeStyles();
      console.log('SiteManager instantiated successfully: true');
    }
    return SiteManager.#instance;
  }


  /**
    Singleton accessor
    @returns  {SiteManager}  Only instance of model manager
  */
  static GetInstance()
  {
    if(SiteManager.#instance === null)
    {
      throw new Error('SiteManager not instantiated');
    }
    return SiteManager.#instance;
  }

  /**
    Fetches page data and builds form  inputs
    @param  {String}  pageName  Name of the page to fetch
    @param  {String}  source  The source of the request (mobile|web)
    @returns  {JSON}  Form inputs of schema fields
  */
  async getPages(source, pageName = '')
  {
    // Find pages
    const manager = ModelManager.GetInstance();
		const mPage = manager.getModel('page');
		if(!mPage)
		{
			throw new Error('Could not find pages');
		}
    const params = (pageName === '' ? {source: source} : {source: source, name: pageName});
		const pages = await mPage.find(params, {name: 1}, 'components name layout custom');

		// Convert form into form inputs for all pages
    let formIdx = -1;
    let verifySmsComponentIdx = -1;
		for(let i = 0; i < pages.length; i++)
		{
			const formInputs = [];

      let formComponent = null;
      for(let componentItr = 0; componentItr < pages[i].components.length; componentItr++)
      {
        if(pages[i].components[componentItr].type === 'form')
        {
          formIdx = componentItr;
          formComponent = pages[i].components[componentItr];
          break;
        }
      }

      if(formComponent !== null)
      {
  			// Iterate rows
  			for(let j = 0; j < formComponent.rows.length; j++)
  			{
  				// Iterate columns in row
  				for(let k = 0; k < formComponent.rows[j].row.length; k++)
  				{
              //console.log(formComponent.rows[j].row[k]);

  					// Schema field to populate
  					if(!formComponent.rows[j].row[k].field.type &&
  							formComponent.rows[j].row[k].field.toString().indexOf('_s_') !== -1)
  					{
  						const id = Mongo.Types.ObjectId(formComponent.rows[j].row[k].field.substr(3));
  						let schemaField = await manager.getSchemaFieldDocuments({_id: id});
  						schemaField = JSON.parse(JSON.stringify(schemaField[0]));
  						schemaField.row = j;
  						schemaField.col = formComponent.rows[j].row[k].col;

  						// Handle any page overrides (allows page to change schema field params for itself)
  						if(formComponent.rows[j].row[k].overrides)
  						{
                //console.log(pages[i].form.rows[j].row[k].overrides);
  							for(let l = 0; l < formComponent.rows[j].row[k].overrides.length; l++)
  							{
  								schemaField[formComponent.rows[j].row[k].overrides[l].name] = formComponent.rows[j].row[k].overrides[l].value;
  							}
  						}

              // Make first value in list the initial value
              if(schemaField.type === 'select')
              {
                if(schemaField.values.length > 0)
                {
                  const values = schemaField.values.split(',');
                  schemaField.value = values[0];
                }
              }

  						formInputs.push(schemaField);
  					}

  					// If _confirm_ detected then this is a confirmation field for another text field
  					else if(formComponent.rows[j].row[k].field.toString().indexOf('_confirm_') !== -1)
  					{
  						const confirmId = formComponent.rows[j].row[k].field.substr(formComponent.rows[j].row[k].field.indexOf('_confirm_') + '_confirm_'.length);
  						//console.log(confirmId);
  						for(let itrIdx = formInputs.length - 1; itrIdx > -1; itrIdx--)
  		        {
  							//console.log('==' + formInputs[itrIdx]._id.toString());
  	            if(formInputs[itrIdx]._id && formInputs[itrIdx]._id.toString() === confirmId)
  	            {
  	              const formInput = JSON.parse(JSON.stringify(formInputs[itrIdx]));
  								formInput.placeholder = 'Confirm ' + formInput.name;
  								formInput.name = '_confirm_' + formInput.name;
  								formInput.row = j;
  								formInputs.push(formInput);
  	            }
  		        }
  					}

            else if(formComponent.rows[j].row[k].field.type.toString().indexOf('_login_container_') !== -1)
            {
              let formField = formComponent.rows[j].row[k].field;
            //  console.log(formField);
              for(let methodItr = 0; methodItr < formField.methods.length; methodItr++)
              {
                let method = formField.methods[methodItr];
                for(let fieldItr = 0; fieldItr < method.fields.length; fieldItr++)
                {
                  let field = method.fields[fieldItr];
                  //console.log(field);
                  if(field.field.toString().indexOf('_s_') !== -1)
                  {
                    const id = Mongo.Types.ObjectId(field.field.substr(3));
        						let schemaField = await manager.getSchemaFieldDocuments({_id: id});
        						schemaField = JSON.parse(JSON.stringify(schemaField[0]));
        						schemaField.row = j;
        						schemaField.col = formComponent.rows[j].row[k].col;


                    field.field = schemaField;

                    //console.log(field);
        						formInputs.push(formComponent.rows[j].row[k].field);
                  }
                }
              }
            }

  					// Link, button, or space
  					else
  					{
  						const formInput = formComponent.rows[j].row[k].field;
  						formInput.row = j;
  						formInput.col = formComponent.rows[j].row[k].col;
  						formInputs.push(formInput);
  					}
  				}
  			}

        pages[i].components[formIdx].form = formInputs;
        delete pages[i].components[formIdx].rows;
      }

      // Populate any fields in the verify SMS component
      let verifySmsComponent = null;
      for(let componentItr = 0; componentItr < pages[i].components.length; componentItr++)
      {
        if(pages[i].components[componentItr].type === 'verify-sms')
        {
          verifySmsComponent = pages[i].components[componentItr];
          break;
        }
      }

      if(verifySmsComponent !== null)
      {
        const id = Mongo.Types.ObjectId(verifySmsComponent.phoneField.substr(3));
        let schemaField = await manager.getSchemaFieldDocuments({_id: id});
        schemaField = JSON.parse(JSON.stringify(schemaField[0]));
        verifySmsComponent.phoneField = schemaField;
      }
		}

    return pages;
  }


  /**
    Build component map
    @returns {Nothing} nothing
  */
  async initializeStyles()
  {
    const manager = ModelManager.GetInstance();
    const mComponent = manager.getModel('component');

    const params = {};
    const sort = {name: 1};
    const components = await mComponent.find(params, sort);
    for(let i = 0; i < components.length; i++)
    {
      this.#components.set(components[i].name, components[i]);
    }
  }

  getInternalTypes()
  {
    return [...this.#internalTypes];
  }


  /**
    Convert a request body to values and validate against schema fields for the page
    @param  {String}  source  The source of the request (web|mobile)
    @param  {String}  pageName  The name of the page to validate against
    @param  {JSON}    requestBody   The HTTP request body
    @returns  {JSON}  pageValues, error
  */
  async requestFieldsToPageValues(headers, pageName, requestBody)
  {
    //console.log(requestBody);
    if(!headers['x-device-id'])
    {
      return { error: 'Missing device ID' };
    }

    // Fields we need to hash after validating
    const secureFieldsToHash = [];

    // Fetch page
    let page = await this.getPages(headers['x-request-source'], pageName);
    page = page[0];

    // Convert request fields to values that align with schema fields from page
    let pageValues = {};

    // Check if we have a form in this pages components
    let formComponent = null;
    for(let i = 0; i < page.components.length; i++)
    {
      if(page.components[i].type === 'form')
      {
        formComponent = page.components[i];
        break;
      }
    }
    if(formComponent !== null)
    {
      //console.log(formComponent.form);
      for(let i = 0; i < formComponent.form.length; i++)
  		{
        let requestValue = requestBody[formComponent.form[i].name];
        //console.log(requestValue);
  			// Schema field
  			if(this.#internalTypes.indexOf(formComponent.form[i].type) === -1 &&
              // Make sure it's not a _confirm_ field
            ((formComponent.form[i].name && this.#internalTypes.indexOf(formComponent.form[i].name.substr(0, formComponent.form[i].name.lastIndexOf('_') + 1)) === -1) || !formComponent.form[i].name))
  			{
          if(formComponent.form[i].lowercase)
          {
            requestValue = (requestValue ? requestValue.toLowerCase() : requestValue);
          }
          if(formComponent.form[i].trim)
          {
            requestValue = (requestValue ? requestValue.trim() : requestValue);
          }

  				// Check if required
  				if(formComponent.form[i].required)
  				{
  					if(requestValue === 'undefined' || requestValue === undefined)
  					{
  						return { error: 'Missing ' + formComponent.form[i].name + ' parameter' };
  					}
            // Check min/max length
            if(requestValue.length < formComponent.form[i].minLength)
            {
              return { error: '' + formComponent.form[i].name + ' is too short. Must be at least ' + formComponent.form[i].minLength + ' characters' };
            }
            if(requestValue.length > formComponent.form[i].maxLength)
            {
              return { error: '' + formComponent.form[i].name + ' is too long. Must be at most ' + formComponent.form[i].maxLength + ' characters' };
            }
  					pageValues[formComponent.form[i].name] = requestValue;
  				}
  				// Not required, check if specified
  				else
  				{
  					if(requestValue !== 'undefined' && requestValue !== '' && requestValue !== undefined)
  					{
  						pageValues[formComponent.form[i].name] = requestValue;
  					}
  				}

          // Check if secure field and value given
          if(formComponent.form[i].type === 'secure' && requestValue !== '')
          {
            secureFieldsToHash.push(formComponent.form[i].name);
          }
  			}
        // Confirmation field
        else if(formComponent.form[i].name.indexOf('_confirm_') !== -1)
        {
          const name = formComponent.form[i].name.substr(formComponent.form[i].name.indexOf('_confirm_') + '_confirm_'.length);
          if(pageValues[name] !== requestValue)
          {
            return { error: name + ' does not match' };
          }
        }
  		}

      // Hash secure fields
      for(let i = 0; i < secureFieldsToHash.length; i++)
      {
        const hashed = await BCrypt.hash(pageValues[secureFieldsToHash[i]], 8);
        const unhashed = pageValues[secureFieldsToHash[i]];
        pageValues[secureFieldsToHash[i]] = {hashed: hashed, unhashed: unhashed};
      }
    }

    //console.log('Page values');
    //console.log(pageValues);

    return {pageValues: pageValues, error: null};
  }

}

module.exports = SiteManager;
