import DLNAClient from '../lib/dlna-client.js';

// 创建DLNA客户端实例
const dlnaClient = new DLNAClient();

// 初始化DLNA客户端
async function initializeDLNA() {
    try {
        await dlnaClient.initialize();
        console.log('DLNA客户端初始化成功');
    } catch (error) {
        console.error('DLNA客户端初始化失败:', error);
    }
}

// 启动时初始化
initializeDLNA();

// 存储当前投屏会话信息
let currentCastSession = null;

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'START_CASTING':
            handleStartCasting(request, sendResponse);
            break;
        case 'STOP_CASTING':
            handleStopCasting(sendResponse);
            break;
        case 'VIDEO_STATE_CHANGED':
            handleVideoStateChanged(request.state);
            break;
        case 'SEARCH_DEVICES':
            handleSearchDevices(sendResponse);
            break;
        case 'GET_DEVICES':
            handleGetDevices(sendResponse);
            break;
        case 'ADD_MANUAL_DEVICE':
            handleAddManualDevice(request, sendResponse);
            break;
    }
    return true;
});

// 处理获取设备列表请求
function handleGetDevices(sendResponse) {
    if (!dlnaClient) {
        sendResponse({ success: false, error: 'DLNA客户端未初始化' });
        return;
    }
    const devices = dlnaClient.getDevices();
    sendResponse({ success: true, devices });
}

// 处理手动添加设备
async function handleAddManualDevice(request, sendResponse) {
    if (!dlnaClient) {
        sendResponse({ success: false, error: 'DLNA客户端未初始化' });
        return;
    }

    try {
        const success = await dlnaClient.addManualDevice(request.ip);
        sendResponse({ success });
    } catch (error) {
        console.error('添加设备失败:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// 处理设备搜索请求
async function handleSearchDevices(sendResponse) {
    if (!dlnaClient) {
        sendResponse({ success: false, error: 'DLNA客户端未初始化' });
        return;
    }

    try {
        await dlnaClient.startDiscovery();
        sendResponse({ success: true });
    } catch (error) {
        console.error('搜索设备失败:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// 处理开始投屏请求
async function handleStartCasting(request, sendResponse) {
    if (!dlnaClient) {
        sendResponse({ success: false, error: 'DLNA客户端未初始化' });
        return;
    }

    try {
        // 如果已经有投屏会话，先停止它
        if (currentCastSession) {
            await stop();
        }

        // 连接到选中的设备
        await dlnaClient.connectToDevice(request.device);

        // 创建新的投屏会话
        currentCastSession = {
            device: request.device,
            video: request.video,
            startTime: Date.now()
        };

        // 设置媒体URL和元数据
        await setAVTransportURI(request.video.src);
        
        // 开始播放
        await play();

        sendResponse({ success: true });
    } catch (error) {
        console.error('投屏失败:', error);
        currentCastSession = null;
        sendResponse({ success: false, error: error.message });
    }
}

// 处理停止投屏请求
async function handleStopCasting(sendResponse) {
    if (!dlnaClient) {
        sendResponse({ success: false, error: 'DLNA客户端未初始化' });
        return;
    }

    try {
        if (currentCastSession) {
            await stop();
            currentCastSession = null;
        }
        sendResponse({ success: true });
    } catch (error) {
        console.error('停止投屏失败:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// 处理视频状态变化
async function handleVideoStateChanged(state) {
    if (!currentCastSession || !dlnaClient) return;

    try {
        switch (state.eventType) {
            case 'play':
                await play();
                break;
            case 'pause':
                await pause();
                break;
            case 'seeking':
                await seek(state.currentTime);
                break;
        }
    } catch (error) {
        console.error('更新播放状态失败:', error);
    }
}

// DLNA控制命令
async function setAVTransportURI(uri) {
    return dlnaClient.sendSOAPAction(
        'urn:schemas-upnp-org:service:AVTransport:1',
        'SetAVTransportURI',
        {
            InstanceID: 0,
            CurrentURI: uri,
            CurrentURIMetaData: ''
        }
    );
}

async function play() {
    return dlnaClient.sendSOAPAction(
        'urn:schemas-upnp-org:service:AVTransport:1',
        'Play',
        {
            InstanceID: 0,
            Speed: '1'
        }
    );
}

async function pause() {
    return dlnaClient.sendSOAPAction(
        'urn:schemas-upnp-org:service:AVTransport:1',
        'Pause',
        {
            InstanceID: 0
        }
    );
}

async function stop() {
    return dlnaClient.sendSOAPAction(
        'urn:schemas-upnp-org:service:AVTransport:1',
        'Stop',
        {
            InstanceID: 0
        }
    );
}

async function seek(time) {
    const timeStr = formatTime(time);
    return dlnaClient.sendSOAPAction(
        'urn:schemas-upnp-org:service:AVTransport:1',
        'Seek',
        {
            InstanceID: 0,
            Unit: 'REL_TIME',
            Target: timeStr
        }
    );
}

// 工具函数
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
} 