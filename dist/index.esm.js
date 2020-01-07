/* no-useless-escape */
function isObjectType(param, type) {
  return Object.prototype.toString.call(param) === "[object ".concat(type, "]");
}

function noop() {}

function one(func) {
  var state = false;
  var ret;
  return function () {
    if (state) return ret;
    ret = func.apply(this, arguments);
    state = true;
    return ret;
  };
}

function index (_ref) {
  var isNative = _ref.isNative,
      _ref$timeout = _ref.timeout,
      timeout = _ref$timeout === void 0 ? 0 : _ref$timeout,
      _ref$debug = _ref.debug,
      debug = _ref$debug === void 0 ? false : _ref$debug,
      _ref$logger = _ref.logger,
      logger = _ref$logger === void 0 ? 'hybrid-jssdk' : _ref$logger;
  var _window = window,
      navigator = _window.navigator;
  var ua = navigator.userAgent;
  var android = !!ua.match(/(Android);?[\s\/]+([\d.]+)?/);
  var osx = !!ua.match(/\(Macintosh; Intel /);
  var ipad = ua.match(/(iPad).*OS\s([\d_]+)/);
  var ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/);
  var iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/);
  var apple = !!(osx || ipad || ipod || iphone);

  var _native = function () {
    if (isObjectType(isNative, 'Function')) return !!isNative();
    return false;
  }();

  var module = {};
  log('env settings:', {
    "native": _native,
    android: android,
    apple: apple,
    timeout: timeout
  });

  function wakeUpJavascriptBridge(callback) {
    function forAndroid(callback) {
      log("wake up for android");

      if (getBridge()) {
        callback(getBridge());
      } else {
        document.addEventListener('WebViewJavascriptBridgeReady', function () {
          callback(getBridge());
        }, false);
      }
    }

    function forApple(callback) {
      log("wake up for apple");

      if (getBridge()) {
        return callback(getBridge());
      }

      if (window.WVJBCallbacks) {
        return window.WVJBCallbacks.push(callback);
      }

      window.WVJBCallbacks = [callback];
      var WVJBIframe = document.createElement('iframe');
      WVJBIframe.style.display = 'none';
      WVJBIframe.src = 'https://__bridge_loaded__';
      document.documentElement.appendChild(WVJBIframe);
      setTimeout(function () {
        document.documentElement.removeChild(WVJBIframe);
      }, 0);
    }

    var wrapCallback = one(function (bridge) {
      return callback(bridge ? module : null);
    });

    if (getBridge()) {
      log("bridge was ready");
      return wrapCallback(getBridge());
    }

    if (!_native) {
      if (timeout) {
        setTimeout(function () {
          log("wakeup timeout");
          wrapCallback(getBridge());
        }, timeout);
      } else {
        return wrapCallback(null);
      }
    }

    android ? forAndroid(wrapCallback) : forApple(wrapCallback);
  }

  function getBridge() {
    return window.WebViewJavascriptBridge || null;
  }

  function defaultDataParser(apiName, response) {
    try {
      var data = JSON.parse(response);

      if (isObjectType(data, 'Object')) {
        return data;
      } else {
        return {
          message: response
        };
      }
    } catch (e) {
      logError("".concat(apiName, " parse error:"), e);
      return {
        message: response
      };
    }
  }

  function log() {
    if (debug) {
      var _console;

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      (_console = console).log.apply(_console, [logger].concat(args));
    }
  }

  function logError() {
    if (debug) {
      var _console2;

      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }

      (_console2 = console).error.apply(_console2, [logger].concat(args));
    }
  }

  Object.assign(module, {
    ready: function ready() {
      return new Promise(function (resolve) {
        return wakeUpJavascriptBridge(resolve);
      });
    },
    invoke: function invoke(apiName, params) {
      var callback = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : noop;
      getBridge() ? getBridge().callHandler(apiName, params, callback) : log("invoke invalid");
    },
    registerApi: function registerApi(apiName) {
      var _this = this;

      var _ref2 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref2$parseData = _ref2.parseData,
          parseData = _ref2$parseData === void 0 ? defaultDataParser : _ref2$parseData,
          _ref2$beforeInvoke = _ref2.beforeInvoke,
          beforeInvoke = _ref2$beforeInvoke === void 0 ? noop : _ref2$beforeInvoke,
          _ref2$afterInvoke = _ref2.afterInvoke,
          afterInvoke = _ref2$afterInvoke === void 0 ? noop : _ref2$afterInvoke;

      log("register api: ".concat(apiName));

      this[apiName] = function () {
        var params = {};
        var options = {};

        if (arguments.length === 1) {
          options = arguments.length <= 0 ? undefined : arguments[0];
        } else if (arguments.length >= 2) {
          params = arguments.length <= 0 ? undefined : arguments[0];
          options = arguments.length <= 1 ? undefined : arguments[1];
        }

        var _options = options,
            _options$success = _options.success,
            success = _options$success === void 0 ? noop : _options$success,
            _options$fail = _options.fail,
            fail = _options$fail === void 0 ? noop : _options$fail,
            _options$complete = _options.complete,
            complete = _options$complete === void 0 ? noop : _options$complete,
            _options$cancel = _options.cancel,
            cancel = _options$cancel === void 0 ? noop : _options$cancel;
        var webData = beforeInvoke(apiName, params) || params;
        log("invoke ".concat(apiName, ", params:"), webData);

        _this.invoke(apiName, webData, function (response) {
          log("".concat(apiName, " called, response:"), response); // return a valid object contains native data

          var nativeData = parseData(apiName, response);
          nativeData = afterInvoke(apiName, nativeData) || nativeData;
          log("".concat(apiName, " data after invoke:"), nativeData);
          var message = nativeData.message;
          log("".concat(apiName, " message:"), nativeData.message);

          if (!message) {
            return;
          }

          var semiIndex = message.indexOf(':');

          switch (message.substring(semiIndex + 1)) {
            case "ok":
              success(nativeData);
              break;

            case "cancel":
              cancel(nativeData);
              break;

            default:
              fail(nativeData);
          }

          complete(nativeData);
        });
      };
    }
  });
  return module;
}

export default index;
