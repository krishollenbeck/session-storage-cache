/**
 * sscache library
 * Copyright (c) 2011, Pamela Fox
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jshint undef:true, browser:true, node:true */
/* global define */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module !== "undefined" && module.exports) {
        // CommonJS/Node module
        module.exports = factory();
    } else {
        // Browser globals
        root.sscache = factory();
    }
}(this, function () {

  // Prefix for all sscache keys
  var CACHE_PREFIX = 'sscache-';

  // Suffix for the key name on the expiration items in sessionStorage
  var CACHE_SUFFIX = '-cacheexpiration';

  // expiration date radix (set to Base-36 for most space savings)
  var EXPIRY_RADIX = 10;

  // time resolution in minutes
  var EXPIRY_UNITS = 60 * 1000;

  // ECMAScript max Date (epoch + 1e8 days)
  var MAX_DATE = Math.floor(8.64e15/EXPIRY_UNITS);

  var cachedStorage;
  var cachedJSON;
  var cacheBucket = '';
  var warnings = false;

  // Determines if sessionStorage is supported in the browser;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  // It's not run at parse-time as it takes 200ms in Android.
  function supportsStorage() {
    var key = '__sscachetest__';
    var value = key;

    if (cachedStorage !== undefined) {
      return cachedStorage;
    }

    // some browsers will throw an error if you try to access session storage (e.g. brave browser)
    // hence check is inside a try/catch
    try {
      if (!sessionStorage) {
        return false;
      }
    } catch (ex) {
      return false;
    }

    try {
      setItem(key, value);
      removeItem(key);
      cachedStorage = true;
    } catch (e) {
        // If we hit the limit, and we don't have an empty sessionStorage then it means we have support
        if (isOutOfSpace(e) && sessionStorage.length) {
            cachedStorage = true; // just maxed it out and even the set test failed.
        } else {
            cachedStorage = false;
        }
    }
    return cachedStorage;
  }

  // Check to set if the error is us dealing with being out of space
  function isOutOfSpace(e) {
    if (e && e.name === 'QUOTA_EXCEEDED_ERR' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            e.name === 'QuotaExceededError') {
        return true;
    }
    return false;
  }

  // Determines if native JSON (de-)serialization is supported in the browser.
  function supportsJSON() {
    /*jshint eqnull:true */
    if (cachedJSON === undefined) {
      cachedJSON = (window.JSON != null);
    }
    return cachedJSON;
  }

  /**
   * Returns a string where all RegExp special characters are escaped with a \.
   * @param {String} text
   * @return {string}
   */
  function escapeRegExpSpecialCharacters(text) {
    return text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
  }

  /**
   * Returns the full string for the sessionStorage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
    return key + CACHE_SUFFIX;
  }

  /**
   * Returns the number of minutes since the epoch.
   * @return {number}
   */
  function currentTime() {
    return Math.floor((new Date().getTime())/EXPIRY_UNITS);
  }

  /**
   * Wrapper functions for sessionStorage methods
   */

  function getItem(key) {
    return sessionStorage.getItem(CACHE_PREFIX + cacheBucket + key);
  }

  function setItem(key, value) {
    // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
    sessionStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
    sessionStorage.setItem(CACHE_PREFIX + cacheBucket + key, value);
  }

  function removeItem(key) {
    sessionStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
  }

  function eachKey(fn) {
    var prefixRegExp = new RegExp('^' + CACHE_PREFIX + escapeRegExpSpecialCharacters(cacheBucket) + '(.*)');
    // Loop in reverse as removing items will change indices of tail
    for (var i = sessionStorage.length-1; i >= 0 ; --i) {
      var key = sessionStorage.key(i);
      key = key && key.match(prefixRegExp);
      key = key && key[1];
      if (key && key.indexOf(CACHE_SUFFIX) < 0) {
        fn(key, expirationKey(key));
      }
    }
  }

  function flushItem(key) {
    var exprKey = expirationKey(key);

    removeItem(key);
    removeItem(exprKey);
  }

  function flushExpiredItem(key) {
    var exprKey = expirationKey(key);
    var expr = getItem(exprKey);

    if (expr) {
      var expirationTime = parseInt(expr, EXPIRY_RADIX);

      // Check if we should actually kick item out of storage
      if (currentTime() >= expirationTime) {
        removeItem(key);
        removeItem(exprKey);
        return true;
      }
    }
  }

  function warn(message, err) {
    if (!warnings) return;
    if (!('console' in window) || typeof window.console.warn !== 'function') return;
    window.console.warn("sscache - " + message);
    if (err) window.console.warn("sscache - The error was: " + err.message);
  }

  var sscache = {
    /**
     * Stores the value in sessionStorage. Expires after specified number of minutes.
     * @param {string} key
     * @param {Object|string} value
     * @param {number} time
     */
    set: function(key, value, time) {
      if (!supportsStorage()) return;

      // If we don't get a string value, try to stringify
      // In future, sessionStorage may properly support storing non-strings
      // and this can be removed.

      if (!supportsJSON()) return;
      try {
        value = JSON.stringify(value);
      } catch (e) {
        // Sometimes we can't stringify due to circular refs
        // in complex objects, so we won't bother storing then.
        return;
      }

      try {
        setItem(key, value);
      } catch (e) {
        if (isOutOfSpace(e)) {
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          var storedKeys = [];
          var storedKey;
          eachKey(function(key, exprKey) {
            var expiration = getItem(exprKey);
            if (expiration) {
              expiration = parseInt(expiration, EXPIRY_RADIX);
            } else {
              // TODO: Store date added for non-expiring items for smarter removal
              expiration = MAX_DATE;
            }
            storedKeys.push({
              key: key,
              size: (getItem(key) || '').length,
              expiration: expiration
            });
          });
          // Sorts the keys with oldest expiration time last
          storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });

          var targetSize = (value||'').length;
          while (storedKeys.length && targetSize > 0) {
            storedKey = storedKeys.pop();
            warn("Cache is full, removing item with key '" + key + "'");
            flushItem(storedKey.key);
            targetSize -= storedKey.size;
          }
          try {
            setItem(key, value);
          } catch (e) {
            // value may be larger than total quota
            warn("Could not add item with key '" + key + "', perhaps it's too big?", e);
            return;
          }
        } else {
          // If it was some other error, just give up.
          warn("Could not add item with key '" + key + "'", e);
          return;
        }
      }

      // If a time is specified, store expiration info in sessionStorage
      if (time) {
        setItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX));
      } else {
        // In case they previously set a time, remove that info from sessionStorage.
        removeItem(expirationKey(key));
      }
    },

    /**
     * Retrieves specified value from sessionStorage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function(key) {
      if (!supportsStorage()) return null;

      // Return the de-serialized item if not expired
      if (flushExpiredItem(key)) { return null; }

      // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
      var value = getItem(key);
      if (!value || !supportsJSON()) {
        return value;
      }

      try {
        // We can't tell if its JSON or a string, so we try to parse
        return JSON.parse(value);
      } catch (e) {
        // If we can't parse, it's probably because it isn't an object
        return value;
      }
    },

    /**
     * Removes a value from sessionStorage.
     * Equivalent to 'delete' in memcache, but that's a keyword in JS.
     * @param {string} key
     */
    remove: function(key) {
      if (!supportsStorage()) return;

      flushItem(key);
    },

    /**
     * Returns whether session storage is supported.
     * Currently exposed for testing purposes.
     * @return {boolean}
     */
    supported: function() {
      return supportsStorage();
    },

    /**
     * Flushes all sscache items and expiry markers without affecting rest of sessionStorage
     */
    flush: function() {
      if (!supportsStorage()) return;

      eachKey(function(key) {
        flushItem(key);
      });
    },

    /**
     * Flushes expired sscache items and expiry markers without affecting rest of sessionStorage
     */
    flushExpired: function() {
      if (!supportsStorage()) return;

      eachKey(function(key) {
        flushExpiredItem(key);
      });
    },

    /**
     * Appends CACHE_PREFIX so sscache will partition data in to different buckets.
     * @param {string} bucket
     */
    setBucket: function(bucket) {
      cacheBucket = bucket;
    },

    /**
     * Resets the string being appended to CACHE_PREFIX so sscache will use the default storage behavior.
     */
    resetBucket: function() {
      cacheBucket = '';
    },

    /**
     * Sets whether to display warnings when an item is removed from the cache or not.
     */
    enableWarnings: function(enabled) {
      warnings = enabled;
    }
  };

  // Return the module
  return sscache;
}));
