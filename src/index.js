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

export default function (
    {
        isNative,
        timeout = 0,
        debug = false,
        logger = 'hybrid-jssdk'
    }
) {
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
            let WVJBIframe = document.createElement('iframe')
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
                    log(`wakeup timeout`)
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

    function toJson(data) {
        try {
            return JSON.parse(data)
        } catch (e) {
            logError(e)
            return null
        }
    }

    function defaultDataParser(apiName, response) {
        try {
            let data = JSON.parse(response)
            if (isObjectType(data, 'Object')) {
                return data
            } else {
                return {
                    message: response
                }
            }
        } catch (e) {
            logError(`${apiName} parse error:`, e)
            return {
                message: response
            }
        }
    }

    function log(...args) {
        if (debug) {
            console.log(`[${logger}]`, ...args)
        }
    }

    function logError(...args) {
        if (debug) {
            console.error(`[${logger}]`, ...args)
        }
    }

    function createApi(apiName, {
        beforeInvoke, parseData, afterInvoke
    }) {
        return function (...args) {
            let params = {}
            let options = {}
            if (args.length === 1) {
                options = args[0]
            } else if (args.length >= 2) {
                params = args[0]
                options = args[1]
            }
            let {
                success = noop,
                fail = noop,
                complete = noop,
                cancel = noop
            } = options

            let webData = beforeInvoke(apiName, params) || params
            log(`invoke ${apiName}, params:`, webData)

            this.invoke(
                apiName,
                webData,
                function (response) {
                    log(`${apiName} called, response:`, response)
                    // return a valid object contains native data
                    let nativeData = parseData(apiName, response)
                    nativeData = afterInvoke(apiName, nativeData) || nativeData
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
    const wakeup = new Promise(resolve => wakeUpJavascriptBridge(resolve))

    log('env settings:', {
        native,
        android,
        apple,
        timeout
    })

    Object.assign(module, {
        ready: () => wakeup,
        getBridge,
        toJson,
        invoke(apiName, params, callback = noop) {
            getBridge() ? getBridge().callHandler(apiName, params, callback) :
                log(`invoke invalid`)
        },
        register(apiName, response, callback = noop) {
            getBridge() ? getBridge().registerHandler(apiName, response, callback) :
                log(`register invalid`)
        },
        registerApi(
            apiName,
            {
                parseData = defaultDataParser,
                beforeInvoke = noop,
                afterInvoke = noop
            } = {}
        ) {
            log(`register api: ${apiName}`)
            this[apiName] = createApi(apiName, {
                parseData, beforeInvoke, afterInvoke
            })

            return this[apiName]
        }
    })

    return module
}
