/* eslint-disable */
function isObjectType(param, type) {
    return Object.prototype.toString.call(param) === `[object ${type}]`
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

export default function ({ isNative, timeout = 300 }) {
    const { navigator } = window
    const { userAgent: ua } = navigator
    const android = ua.match(/(Android);?[\s\/]+([\d.]+)?/)
    // const osx = !!ua.match(/\(Macintosh; Intel /)
    // const ipad = ua.match(/(iPad).*OS\s([\d_]+)/)
    // const ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/)
    // const iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/)
    // const apple = osx || ipad || ipod || iphone
    const native = (function () {
        if (isObjectType(isNative, 'Function')) return !!isNative()
        return false
    })()
    const module = {}

    function wakeUpJavascriptBridge(callback) {
        function forAndroid(callback) {
            if (window.WebViewJavascriptBridge) {
                callback(window.WebViewJavascriptBridge)
            } else {
                document.addEventListener(
                    'WebViewJavascriptBridgeReady'
                    , function () {
                        callback(window.WebViewJavascriptBridge)
                    },
                    false
                )
            }
        }

        function forApple(callback) {
            if (window.WebViewJavascriptBridge) { return callback(window.WebViewJavascriptBridge) }
            if (window.WVJBCallbacks) { return window.WVJBCallbacks.push(callback) }
            window.WVJBCallbacks = [callback]
            var WVJBIframe = document.createElement('iframe')
            WVJBIframe.style.display = 'none'
            WVJBIframe.src = 'https://__bridge_loaded__'
            document.documentElement.appendChild(WVJBIframe)
            setTimeout(function () { document.documentElement.removeChild(WVJBIframe) }, 0)
        }

        let wrapCallback = one(function (bridge) {
            return callback(bridge ? module : null)
        })

        if (window.WebViewJavascriptBridge) {
            return wrapCallback(window.WebViewJavascriptBridge)
        }

        if (!native) {
            if (timeout) {
                setTimeout(function () {
                    wrapCallback(window.WebViewJavascriptBridge || null)
                }, timeout)
            } else {
                return wrapCallback(null)
            }
        }

        android ? forAndroid(wrapCallback) : forApple(wrapCallback)
    }

    Object.assign(module, {
        ready: () => new Promise(resolve => wakeUpJavascriptBridge(resolve)),
        getBridge: () => window.WebViewJavascriptBridge
    })

    return module
}
