/* no-useless-escape */
function isObjectType(param, type) {
    return Object.prototype.toString.call(param) === `[object ${type}]`
}

function noop() {
}

function one(func) {
    let state = false
    let ret
    return function () {
        if (state) return ret
        ret = func.apply(this, arguments)
        state = true
        return ret
    }
}

export default function ({isNative, timeout = 0, debug = false, logger = 'hybrid-jssdk'}) {
    const {navigator} = window
    const {userAgent: ua} = navigator
    const android = !!(ua.match(/(Android);?[\s\/]+([\d.]+)?/))
    const osx = !!ua.match(/\(Macintosh; Intel /)
    const ipad = ua.match(/(iPad).*OS\s([\d_]+)/)
    const ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/)
    const iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/)
    const apple = !!(osx || ipad || ipod || iphone)
    const native = (function () {
        if (isObjectType(isNative, 'Function')) return !!isNative()
        return false
    })()
    const module = {}
    log('env settings:', {
        native,
        android,
        apple,
        timeout
    })

    function wakeUpJavascriptBridge(callback) {
        function forAndroid(callback) {
            log(`wake up for android`)
            if (getBridge()) {
                callback(getBridge())
            } else {
                document.addEventListener(
                    'WebViewJavascriptBridgeReady'
                    , function () {
                        callback(getBridge())
                    },
                    false
                )
            }
        }

        function forApple(callback) {
            log(`wake up for apple`)
            if (getBridge()) {
                return callback(getBridge())
            }
            if (window.WVJBCallbacks) {
                return window.WVJBCallbacks.push(callback)
            }
            window.WVJBCallbacks = [callback]
            var WVJBIframe = document.createElement('iframe')
            WVJBIframe.style.display = 'none'
            WVJBIframe.src = 'https://__bridge_loaded__'
            document.documentElement.appendChild(WVJBIframe)
            setTimeout(function () {
                document.documentElement.removeChild(WVJBIframe)
            }, 0)
        }

        let wrapCallback = one(function (bridge) {
            return callback(bridge ? module : null)
        })

        if (getBridge()) {
            log(`bridge was ready`)
            return wrapCallback(getBridge())
        }

        if (!native) {
            if (timeout) {
                setTimeout(function () {
                    log(`ready timeout`)
                    wrapCallback(getBridge())
                }, timeout)
            } else {
                return wrapCallback(null)
            }
        }

        android ? forAndroid(wrapCallback) : forApple(wrapCallback)
    }

    function getBridge() {
        return window.WebViewJavascriptBridge || null
    }

    function defaultDataParser(apiName, response) {
        try {
            let data = JSON.parse(response)
            if (isObjectType(data, 'Object')) {
                return data
            } else {
                return {
                    message: data
                }
            }
        } catch (e) {
            logError(e)
            return {
                message: response
            }
        }
    }

    function log(...args) {
        if (debug) {
            console.log(logger, ...args)
        }
    }

    function logError(...args) {
        if (debug) {
            console.error(logger, ...args)
        }
    }

    Object.assign(module, {
        ready: () => new Promise(resolve => wakeUpJavascriptBridge(resolve)),
        invoke: function (apiName, params, callback = noop) {
            getBridge() ? getBridge().callHandler(apiName, params, callback) :
                log(`invoke invalid`)
        },
        registerApi: function (
            apiName,
            {
                parseData = defaultDataParser,
                beforeInvoke = noop,
                afterInvoke = noop
            } = {}
        ) {
            log(`register api: ${apiName}`)
            this[apiName] = (
                params = {},
                {
                    success = noop,
                    fail = noop,
                    complete = noop,
                    cancel = noop
                } = {}
            ) => {
                let webData = beforeInvoke(apiName, params) || params
                log(`invoke ${apiName}, params:`, webData)

                this.invoke(
                    apiName,
                    webData,
                    function (response) {
                        log(`${apiName} called, response:`, response)
                        // return a valid object contains native data
                        let nativeData = parseData(apiName, response)
                        afterInvoke(apiName, nativeData)
                        log(`${apiName} data after invoke:`, nativeData)

                        let message = nativeData.message
                        log(`${apiName} message:`, nativeData.message)

                        if (!message) {
                            return
                        }

                        let semiIndex = message.indexOf(':')
                        switch (message.substring(semiIndex + 1)) {
                            case "ok":
                                success(nativeData)
                                break
                            case "cancel":
                                cancel(nativeData)
                                break
                            default:
                                fail(nativeData)
                        }
                        complete(nativeData)
                    }
                )
            }
        }
    })

    return module
}
