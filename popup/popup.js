// 存储当前选中的设备
let selectedDevice = null;
let currentVideo = null;
let pollInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 获取当前页面视频信息
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'GET_VIDEO_INFO'}, (response) => {
            if (response && response.videoFound) {
                currentVideo = response.videoInfo;
                document.getElementById('currentVideo').textContent = 
                    `已检测到视频: ${response.videoInfo.title || '未知标题'}`;
                document.getElementById('castButton').disabled = false;
            }
        });
    });

    // 初始化设备列表
    refreshDeviceList();
    // 开始轮询设备
    startDevicePolling();

    // 绑定按钮事件
    document.getElementById('refreshDevices').addEventListener('click', refreshDeviceList);
    document.getElementById('castButton').addEventListener('click', startCasting);
    document.getElementById('addDevice').addEventListener('click', addManualDevice);
    
    // 添加输入框回车事件
    document.getElementById('deviceIP').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addManualDevice();
        }
    });
});

// 开始设备轮询
function startDevicePolling() {
    // 每10秒轮询一次
    pollInterval = setInterval(refreshDeviceList, 10000);
}

// 停止设备轮询
function stopDevicePolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// 添加手动输入的设备
async function addManualDevice() {
    const ipInput = document.getElementById('deviceIP');
    const ip = ipInput.value.trim();
    
    if (!isValidIP(ip)) {
        showError('请输入有效的IP地址');
        return;
    }

    try {
        // 发送消息到background script尝试连接设备
        chrome.runtime.sendMessage({
            type: 'ADD_MANUAL_DEVICE',
            ip: ip
        }, response => {
            if (response.success) {
                ipInput.value = '';
                hideError();
                refreshDeviceList();
            } else {
                showError(response.error || '添加设备失败');
            }
        });
    } catch (error) {
        showError('添加设备失败: ' + error.message);
    }
}

// 刷新设备列表
function refreshDeviceList() {
    const devicesContainer = document.getElementById('devices');
    devicesContainer.innerHTML = '<p>正在搜索设备...</p>';

    // 获取设备列表
    chrome.runtime.sendMessage({
        type: 'GET_DEVICES'
    }, response => {
        if (response.success) {
            updateDeviceList(response.devices);
        } else {
            devicesContainer.innerHTML = `<p>获取设备失败: ${response.error || '未知错误'}</p>`;
        }
    });
}

// 更新设备列表UI
function updateDeviceList(devices) {
    const devicesContainer = document.getElementById('devices');
    devicesContainer.innerHTML = '';

    if (devices.length === 0) {
        devicesContainer.innerHTML = '<p>未找到可用设备</p>';
        return;
    }

    devices.forEach(device => {
        const deviceElement = createDeviceElement(device);
        devicesContainer.appendChild(deviceElement);
    });
}

// 创建设备元素
function createDeviceElement(device) {
    const div = document.createElement('div');
    div.className = 'device-item';
    
    const deviceInfo = document.createElement('div');
    deviceInfo.className = 'device-info';
    
    const deviceName = document.createElement('div');
    deviceName.className = 'device-name';
    deviceName.textContent = device.friendlyName;
    
    const deviceIP = document.createElement('div');
    deviceIP.className = 'device-ip';
    deviceIP.textContent = device.address;
    
    deviceInfo.appendChild(deviceName);
    deviceInfo.appendChild(deviceIP);
    div.appendChild(deviceInfo);

    div.addEventListener('click', () => {
        // 移除其他设备的选中状态
        document.querySelectorAll('.device-item').forEach(el => {
            el.classList.remove('selected');
        });
        
        // 选中当前设备
        div.classList.add('selected');
        selectedDevice = device;
        
        // 启用投屏按钮
        if (currentVideo) {
            document.getElementById('castButton').disabled = false;
        }
    });

    return div;
}

// 开始投屏
function startCasting() {
    if (!selectedDevice || !currentVideo) {
        showError('请先选择设备和视频');
        return;
    }

    // 发送投屏请求到background script
    chrome.runtime.sendMessage({
        type: 'START_CASTING',
        device: selectedDevice,
        video: currentVideo
    }, response => {
        if (response.success) {
            document.getElementById('castButton').textContent = '投屏中...';
            document.getElementById('castButton').disabled = true;
        } else {
            showError(`投屏失败: ${response.error}`);
        }
    });
}

// 显示错误信息
function showError(message) {
    const errorElement = document.querySelector('.error-message') || createErrorElement();
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// 隐藏错误信息
function hideError() {
    const errorElement = document.querySelector('.error-message');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// 创建错误信息元素
function createErrorElement() {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    document.querySelector('.controls').insertBefore(errorElement, document.getElementById('castButton'));
    return errorElement;
}

// 验证IP地址
function isValidIP(ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    
    const parts = ip.split('.');
    return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
    });
} 