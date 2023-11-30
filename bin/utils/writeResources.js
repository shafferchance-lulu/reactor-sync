const toFiles = require('./toFiles');
const toMethodName = require('./resourceName');
const ruleComponentsName = 'rule_components';
const pages = { 'page[size]': 999 };
// The following types are a WiP
/** @typedef {"property" | "rule" | "rule_component" | "environment" | "extension" | "property"} ResourceType */

/**
 * @typedef {Object} ReactorTypeElement
 * @property {string} id
 * @property {string} name
 * @property {string} libPath
 * @property {string} [viewPath]
 * @property {string} displayName
 * @property {string} [categoryName]
 * @property {{ [key: string]: Record<string,string | number | boolean | string[] | number[] | boolean[]> }[]} [transforms]
 */

/**
 * @typedef  {Object}  ReactorAttributes
 * @property {Date}  created_at
 * @property {string}  delegate_descriptor_id
 * @property {string}  deleted_at
 * @property {boolean} dirty
 * @property {string}  name
 * @property {boolean} negate
 * @property {number}  order
 * @property {number}  rule_order
 * @property {number}  timeout
 * @property {boolean} delay_next
 * @property {boolean} published
 * @property {Date}    updated_at
 * @property {string}  created_by_email
 * @property {string}  created_by_display_name
 * @property {string}  updated_by_email
 * @property {string}  updated_by_display_name 
 * @property {string}  settings
 * @property {ReactorTypeElement[]} [data_elements]
 * @property {ReactorTypeElement[]} [actions]
 * @property {ReactorTypeElement[]} [events]
 * @property {ReactorTypeElement[]} [conditions]
 */

/**
 * @typedef  {Object} ReactorDataEntry
 * @property {string} id
 * @property {string} type
 * @property {ReactorAttributes} attributes
 * @property {{ [key: string]: { links: { related: string }, data?: { id: string, type: string } } }} relationships
 * @property {{ [key: string]: string }} links
 * @property {{ [key: string]: any}} meta
 */

/**
 * @typedef  {Object} ReactorResponse
 * @property {Array<ReactorDataEntry>} data
 * @property {{ [key: string]: any }} meta 
 */

/**
 * 
 * @param {ResourceType} resourceType
 * @param {import('..').ReactorSettingsWithSDK} args
 */
function formArgs(resourceType, args) {
  return {
    propertyId: args.propertyId,
    reactor: args.reactor,
    propertyPath: `./${args.propertyId}`,
    dataElementsPath: `${args.propertyId}/${resourceType}`
  };
}

/**
 * 
 * @template {ReactorDataEntry} T
 * @param {T | T[]} data 
 * @param {ResourceType} resourceType 
 * @param {import('..').ReactorSettingsWithSDK} settings
 * @returns {Promise<void>}
 */
function writeRemaining(data, resourceType, settings) {
  if (Array.isArray(data)) {
    return Promise.all(data.map(resource => toFiles(resource, formArgs(resourceType, settings))));
  } else {
    return toFiles(data, formArgs(resourceType, settings));
  }
}

/**
 * 
 * @param {ResourceType[]} resourceTypes 
 * @param {ResourceType} resourceType 
 * @param {ReactorDataEntry} adobeResources 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 * @returns 
 */
function writeRuleComponent(resourceTypes, resourceType, adobeResources, settings) {
  return Promise.all(adobeResources.map((rule) =>
    settings.reactor.listRuleComponentsForRule(rule.id, pages)
      .then((adobeRuleComponents) =>
        writeRemaining(adobeRuleComponents, resourceType, settings)
      )
  ));
}

/**
 * 
 * @param {ResourceType[]} resourceTypes 
 * @param {ResourceType} resourceType 
 * @param {ReactorDataEntry} adobeResources 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 * @returns 
 */
function writeRuleComponentOr(resourceTypes, resourceType, adobeResources, settings) {
  if (resourceType === 'rule' && resourceTypes.includes(ruleComponentsName))
    return writeRuleComponent(resourceTypes, resourceType, adobeResources, settings);
}

/**
 * @template {ResourceType} A
 * @param {A} resourceName 
 * @returns {`list${A}ForProperty`}
 */
function getPropertyOr(resourceName) {
  if (resourceName === 'Property') return 'getProperty';
  return `list${resourceName}ForProperty`;
}

/**
 * 
 * @param {ResourceType[]} resourceTypes 
 * @param {ResourceType} resourceType 
 * @param {ReactorDataEntry} adobeResources 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 * @returns 
 */
function writeAll(resourceTypes, resourceType, adobeResources, settings) {
  const ruleComponent = writeRuleComponentOr(resourceTypes, resourceType, adobeResources, settings);

  if (ruleComponent === undefined) {
    return writeRemaining(adobeResources, resourceType, settings);
  }

  return ruleComponent;
}

/**
 * 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 * @param {ResourceType} resourceName 
 * @param {ResourceType} resourceType 
 * @param {ResourceType[]} resourceTypes 
 * @returns {Promise<void>}
 */
function listResources(settings, resourceName, resourceType, resourceTypes) {
  return settings.reactor[`${getPropertyOr(resourceName)}`](settings.propertyId, pages)
    .then(({ data: adobeResources }) =>
      writeAll(resourceTypes, resourceType, adobeResources, settings)
    );
}

/**
 * 
 * @param {ResourceType[]} resourceTypes 
 * @param {import('..').ReactorSettingsWithSDK} settings 
 */
function writeResources(resourceTypes, settings) {
  return Promise.all(resourceTypes.map((resourceType, _idx, resourceTypes) => {
    if (resourceType === ruleComponentsName) return;
    if (resourceType === 'property') return;
    const resourceName = toMethodName(resourceType, false);

    try {
      return listResources(settings, resourceName, resourceType, resourceTypes);
    } catch (error) {
      console.error('🚨Error in writeResources(): ', error);
    }
  }));
}

module.exports = writeResources;