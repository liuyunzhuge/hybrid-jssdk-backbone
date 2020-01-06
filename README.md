# hybrid-jssdk-backbone
可用于web与app之间进行混合开发的jssdk开发骨架，通过约定的方式与app快速打通服务。

## 背景
网页与app之间的交互，是非常重要的开发内容。如果网页想要与app发生交互，app必须给webview注入特殊地全局对象，以便网页中的脚本能够借助这个全局对象访问app提供的api。app如何给webview注入全局对象，安卓端可使用这个库[JsBridge](https://github.com/lzyzsd/JsBridge), iOS可以使用这个库[WebViewJavascriptBridge](https://github.com/marcuswestin/WebViewJavascriptBridge)，它们都会给网页注入一个WebViewJavascriptBridge的全局对象。也就是说，网页与app之间的交互问题，其实就是使用WebViewJavascriptBridge这个对象的问题。那使用它难吗，当然不难，前面两个库的文档都有用法介绍；但是这一块的代码，决不应该随随便便写，应该朝着SDK的目标去写，这样可以统一管理所有网页与app之间的交互逻辑，尤其当这些技术服务要应用于多个产品的时候，SDK更能发挥价值。**hybrid-jssdk-backbone**就是为了简化SDK的封装而产生的。

**hybrid-jssdk-backbone**的作用是帮助你封装你的产品的SDK，毕竟每个产品在做网页与app交互时，app能提供哪些api，各个产品都是不同的，所以**hybrid-jssdk-backbone**不主动注册app的api，它不知道app会提供哪些api，但是它提供了`registerApi`这个方法，可以帮助你来注册自己的项目或产品中，跟app的开发同事一起协商出来的app调用；同时它约定了一套注册api的统一规则，以便能够把api的调用结果和回调函数约束成同一个方式，使sdk更易于使用；第三，它提供了一个`ready`这样的函数，它会返回`Promise`实例，通过它注册`then`回调，在此回调内调用sdk，会更加安全，毕竟`WebViewJavascriptBridge`对象的获得是一个异步过程：
```js
sdk.ready().then(sdk => {
    if(sdk) {
        // call app's api through sdk, like `sdk.openNativeView(...)`
    } else {
        // sdk is not available
    }
})
```
接下来看看如何利用**hybrid-jssdk-backbone**封装一个自己的SDK。

## 如何使用

### 安装
```
npm install hybrid-jssdk-backbone --save
```
暂时未发布，还不能使用上面的命令。

### 第一步：构造SDK实例
```js
import HybridSdk from 'hybrid-jssdk-backbone'

const sdk = new HybridSdk({
    debug: process.env.NODE_ENV !== 'production',
    isNative() {
        return window.navigator.userAgent.indexOf('MyProduct) > -1
    }
})
```
这个就是为了构造出一个可以进行扩展的SDK实例。HybridSdk的构造函数支持以下几个参数：
* isNative
    * default: false,
    * type: Function
    * desc: 你需要传入一个函数，以便SDK内部能够用来识别当前是在自己app的原生的webview环境中。这个地方千万注意，记得一定要提醒你的app开发同事，往webview的userAgent里面注入产品的标识和版本号，就像微信一样，直接通过userAgent就能判断出是不是在微信的客户端。
* timeout
    * default: 0,
    * type: Number
    * desc：如果isNative处理好，这个timeout参数毫无价值。它只是为了兼容那些一开始没有想到给userAgent注入自身标识的产品，因为一旦产品已经发布，就不得不去兼容老版本，而老版本没有自身标识，所以导致网页在老版本里无法立马就判断这是自己的产品环境，所以提供timeout参数，就是为了延迟一下后去判断WebViewJavascriptBridge对象是否存在，从而判断出是否是native环境，以便后面介绍的`ready`函数返回的`Promise`还能被resolve。
* debug
    * default: false
    * desc: 开启后，会在控制台打印日志，便于真机调试。
* logger
    * default: 'hybrid-jssdk'
    * default: 控制台打印时的前缀。

一定要在产品的第一版就往userAgent里注入产品标识，保证**isNative**能够准确判断是否是自身产品的webview环境。

### 第二步：注册一个api
上一步构建出来的sdk，可通过`registerApi`来注册api
```js
sdk.registerApi('openNativeView', {
    parseData(apiName, response) {
        
    },
    beforeInvoke(apiName, params) {
        
    },
    afterInvoke(apiName, nativeData) {

    }
})
```
`registerApi`这个函数接收2个参数，第一个参数是`apiName`，也就是你跟app同事约定的api名称。第二个参数，是一个options，它用来自定义以下三个回调函数：
* parseData
    * default: Function
    * type: Function
    * desc: 这个回调函数用来对api调用后，app返回的原生信息进行解析，它有两个参数，第一个是对应的api名称`apiName`，第二个是app返回的原生信息是一个字符串`response`。为了统一api的调用结果和api回调函数的使用，约定：
        * response必须用json格式
        * response所包含的json数据，必须有一个`message`字段，它是一个字符串，且这个`message`字段，必须按照`apiName:ok|cancel|fail`的格式进行组织。比如`openNativeView`这个api，`message`有三种组织形式，分别是`openNativeView:ok`,`openNativeView:cancel`,`openNativeView:fail`，代表接口调用成功，调用取消，以及调用失败的含义。当使用`sdk.openNativeView`时，是根据message决定要调用哪个回调函数的。`ok|cancel|fail`不是全部都要的，但至少要有`ok`，其它两个取决于api的逻辑是否需要它。如果某个api调用，会引发app弹出对话框，那么当用户在对话框内点击取消的时候，就可以回调`cancel`的`message`。
    这个option有默认值，使用的是下面这个函数逻辑：
    ```js
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
    ```
    如果app端遵照以上约定的方式实现api，则此回调函数应该不需要设置。
* beforeInvoke
    * default: Function
    * type: Function
    * desc: 这个函数在api被触发前调用，用来处理要传递给app对应api的参数，它接收2个参数，第一个参数是对应的api名称`apiName`，第二个参数是api被调用时传入的参数`params`。此函数内可对`params`进行修改，然后才会`invoke`到app。此函数可返回一个新对象，将直接替代原params，传递至app进行调用。

* afterInvoke
    * default: Function
    * type: Function
    * desc: 这个函数在`parseData`之后调用，可对`parseData`之后的数据，做进一步加工（比如当app没有按约定写`response`的时候）。它接收2个参数，第一个参数是对应的api名称`apiName`，第二个参数是parseData的返回值`nativeData`。此函数内可对`nativeData`进行修改，此函数也可返回一个新对象，将直接替代原nativeData，进行后续的逻辑。后续的逻辑其实非常简单，就是根据`nativeData`的`message`属性，判断出api调用的结果，然后调用对应的api的回调函数，后续的核心代码：
        ```js
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
        ```
当使用`sdk.registerApi('openNativeView')`之后，`sdk`实例上就会多出一个api方法`openNativeView`，后续在功能开发当中，直接使用`sdk.openNativeView(...)`即可触发对app的原生调用。

如果一切按约定编码，那么`sdk.registerApi`在注册api的时候，不需要第二个参数。

### 第三步：使用sdk注册的api
使用以下方式，来使用上面注册的api：
```js
sdk.ready().then(sdk => {
    if(sdk) {
        sdk.openNativeView({
            link: '....'
        }, {
            success() {

            },
            fail() {

            },
            cancel() {

            },
            complete() {

            }
        });
    }
})
```
每一个api在注册后，都通过`sdk[apiName]`的方式调用，这个调用接收2个参数，第一个参数是api调用所需要的参数object，第二个参数是一个options对象，用来配置api调用的回调函数。所有通过`registerApi`注册的api，都采用相同的回调函数：`success fail cancel complete`，含义如其字面意思一样；这个函数也可以只传递一个参数，代表配置回调函数的options对象。

另外`sdk`还提供了一个`ready`函数，这个函数调用后会返回一个`Promise`，在它的then回调内，可直接判断回调参数是否为真，继续是否进行native的调用。因为sdk内部需要初始化WebViewJavascriptBridge对象，而这个对象的注入过程是异步的，所以单独封装了一个`ready`函数。

### APP端如何写
android开发示例:
```java
webView.registerHandler("openNativeView", new BridgeHandler() {
    @Override
    public void handler(String data, CallBackFunction function) {
        // todo finish openNativeView
        function.onCallBack("{\"message\": \"openNativeView:ok\"}");
    }
});
```
iOS开发示例：
```
[self.bridge registerHandler:@"openNativeView" handler:^(id data, WVJBResponseCallback responseCallback) {
	responseCallback(@"{\"message\": \"openNativeView:ok\"}");
}];
```

## 强调

* app端一定要通过userAgent注入产品标识
* app端写api的回调数据，一定要转为json格式，且要包含`message`属性