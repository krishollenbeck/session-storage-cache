sscache
===============================
This is a simple library that emulates `memcache` functions using HTML5 `localStorage`, so that you can cache data on the client
and associate an expiration time with each piece of data. If the `localStorage` limit (~5MB) is exceeded, it tries to create space by removing the items that are closest to expiring anyway. If `localStorage` is not available at all in the browser, the library degrades by simply not caching and all cache requests return null.

Methods
-------

The library exposes 5 methods: `set()`, `get()`, `remove()`, `flush()`, and `setBucket()`.

* * *

### sscache.set
Stores the value in localStorage. Expires after specified number of minutes.
#### Arguments
1. `key` (**string**)
2. `value` (**Object|string**)
3. `time` (**number: optional**)

* * *

### sscache.get
Retrieves specified value from localStorage, if not expired.
#### Arguments
1. `key` (**string**)

#### Returns
**string | Object** : The stored value. If no value is available, null is returned.

* * *

### sscache.remove
Removes a value from localStorage.
#### Arguments
1. `key` (**string**)

* * *

### sscache.flush
Removes all sscache items from localStorage without affecting other data.

* * *

### sscache.setBucket
Appends CACHE_PREFIX so sscache will partition data in to different buckets
#### Arguments
1. `bucket` (**string**)

Usage
-------

The interface should be familiar to those of you who have used `memcache`, and should be easy to understand for those of you who haven't.

For example, you can store a string for 2 minutes using `sscache.set()`:

```js
sscache.set('greeting', 'Hello World!', 2);
```

You can then retrieve that string with `sscache.get()`:

```js
alert(sscache.get('greeting'));
```

You can remove that string from the cache entirely with `sscache.remove()`:

```js
sscache.remove('greeting');
```

You can remove all items from the cache entirely with `sscache.flush()`:

```js
sscache.flush();
```

You can remove only expired items from the cache entirely with `sscache.flushExpired()`:

```js
sscache.flushExpired();
```

You can also check if local storage is supported in the current browser with `sscache.supported()`:

```js
if (!sscache.supported()) {
  alert('Local storage is unsupported in this browser');
  return;
}
```

You can enable console warning if set fails with `sscache.enableWarnings()`:

```js
// enable warnings
sscache.enableWarnings(true);

// disable warnings
sscache.enableWarnings(false);
```

The library also takes care of serializing objects, so you can store more complex data:

```js
sscache.set('data', {'name': 'Pamela', 'age': 26}, 2);
```

And then when you retrieve it, you will get it back as an object:

```js
alert(sscache.get('data').name);
```

If you have multiple instances of sscache running on the same domain, you can partition data in a certain bucket via:

```js
sscache.set('response', '...', 2);
sscache.setBucket('lib');
sscache.set('path', '...', 2);
sscache.flush(); //only removes 'path' which was set in the lib bucket
```

For more live examples, play around with the demo here:
http://pamelafox.github.com/sscache/demo.html


Real-World Usage
----------
This library was originally developed with the use case of caching results of JSON API queries
to speed up my webapps and give them better protection against flaky APIs.

For example, [RageTube](https://github.com/pamelafox/ragetube) uses `sscache` to fetch Youtube API results for 10 minutes:

```js
var key = 'youtube:' + query;
var json = sscache.get(key);
if (json) {
  processJSON(json);
} else {
  fetchJSON(query);
}

function processJSON(json) {
  // ..
}

function fetchJSON() {
  var searchUrl = 'http://gdata.youtube.com/feeds/api/videos';
  var params = {
   'v': '2', 'alt': 'jsonc', 'q': encodeURIComponent(query)
  }
  JSONP.get(searchUrl, params, null, function(json) {
    processJSON(json);
    sscache.set(key, json, 10);
  });
}
```

It does not have to be used for only expiration-based caching, however. It can also be used as just a wrapper for `localStorage`, as it provides the benefit of handling JS object (de-)serialization.

For example, the [QuizCards](https://github.com/pamelafox/chrome-cards) Chrome extensions use `sscache`
to store the user statistics for each user bucket, and those stats are an array
of objects.

```js
function initBuckets() {
  var bucket1 = [];
  for (var i = 0; i < CARDS_DATA.length; i++) {
    var datum = CARDS_DATA[i];
    bucket1.push({'id': datum.id, 'lastAsked': 0});
  }
  sscache.set(LS_BUCKET + 1, bucket1);
  sscache.set(LS_BUCKET + 2, []);
  sscache.set(LS_BUCKET + 3, []);
  sscache.set(LS_BUCKET + 4, []);
  sscache.set(LS_BUCKET + 5, []);
  sscache.set(LS_INIT, 'true')
}
```

Browser Support
----------------

The `sscache` library should work in all browsers where `sessionStorage` is supported.
A list of those is here:
http://www.quirksmode.org/dom/html5.html


Building
----------------

For contributors:

* Run `npm install` to install all the dependencies.
* Run `grunt`. The default task will check the files with jshint, minify them, and use browserify to generate a bundle for testing.
* Run `grunt test` to run the tests.


For repo owners, after a code change:

* Run `grunt bump` to tag the new release.
* Run `npm login`, `npm publish` to release on npm.


