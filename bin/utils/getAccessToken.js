/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const fs = require('fs');
const jwt = require('jwt-simple');

// eslint-disable-next-line
const fetch = import("node-fetch");

async function checkAccessToken(settings) {
  return getAccessToken(settings);
}

async function getJWTBasedAccessToken(settings) {
  const environment = settings.environment;
  const integration = settings.integration;

  if (!integration.payload) {
    throw Error(
      'settings file does not have an "integration.payload" property.'
    );
  }
  if (!integration.privateKey) {
    throw Error(
      'settings file does not have an "integration.privateKey" property.'
    );
  }

  let privateKeyContent;

  // check the privateKey exists
  if (fs.existsSync(integration.privateKey)) {
    privateKeyContent = fs.readFileSync(integration.privateKey);
  } else {
    throw Error('Private Key file does not exist at that location.');
  }

  // generate a jwtToken
  integration.payload.exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const jwtToken = jwt.encode(integration.payload, privateKeyContent, 'RS256');

  // Make a request to exchange the jwt token for a bearer token
  try {
    const body = await fetch.then(mod => mod.default(environment.jwt, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
      },
      form: {
        client_id: integration.clientId,
        client_secret: integration.clientSecret,
        jwt_token: jwtToken,
      },
    }));

    const result = await body.json()

    return result.access_token;
  } catch (e) {

    const parsedErrorObject = JSON.parse(e.error);

    throw new Error(
      `Error retrieving access token. ${parsedErrorObject.error_description}.  Please check the values in the settings file are still valid`
    );
  }
}

const defaultScope = [
  'AdobeID',
  'openid',
  'read_organizations',
  'additional_info.job_function',
  'additional_info.projectedProductContext',
  'additional_info.roles',
];


// Since JWT is deprecated adding this
// const ADOBE_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
async function getOAuthBasedAccessToken(settings) {
  const integration = settings.integration;
  const environment = settings.environment;
  const grantType =
    settings.integration['grantType'] === undefined
      ? 'client_credentials'
      : settings.integration['grantType'];
  const scope =
    settings.integration['scope'] === undefined
      ? defaultScope.concat(',')
      : settings.integration['scope'];
  
  return fetch.then(mod => mod.default(environment.oauth, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=${grantType}&client_id=${integration.clientId}&client_secret=${integration.clientSecret}&scope=${scope}`,
  })).then((res) => res.json())
  .then((body) => {

    return body["access_token"];
  });
}

async function getAccessToken(settings) {
  const integration = settings.integration;
  const environment = settings.environment;

  // check to make sure we have all of the correct information in the settings file
  if (!integration) {
    throw Error('settings file does not have an "integration" property.');
  }
  if (!integration.clientId) {
    throw Error(
      'settings file does not have an "integration.clientId" property.'
    );
  }
  if (!integration.clientSecret) {
    throw Error(
      'settings file does not have an "integration.clientSecret" property.'
    );
  }

  if (!environment) {
    throw Error('settings file does not have an "environment" property.');
  }
  if (!environment.jwt && !environment.oauth) {
    throw Error(
      'settings file does not have an "environment.(jwt|oauth)" property.'
    );
  }

  if (environment.jwt) {
    return getJWTBasedAccessToken(settings);
  } else {
    return getOAuthBasedAccessToken(settings);
  }
}

module.exports = checkAccessToken;
