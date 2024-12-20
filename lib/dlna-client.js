class DLNAClient {
    constructor() {
        this.devices = new Map();
        this.currentDevice = null;
        this.httpEndpoint = 'http://localhost:8000'; // 本地DLNA服务器地址
    }

    // 初始化客户端
    async initialize() {
        try {
            // 初始化时尝试连接本地服务器
            await this.checkLocalServer();
            return true;
        } catch (error) {
            console.error('DLNA初始化失败:', error);
            return false;
        }
    }

    // 检查本地服务器
    async checkLocalServer() {
        try {
            const response = await fetch(`${this.httpEndpoint}/status`);
            if (!response.ok) {
                throw new Error('本地服务器未运行');
            }
        } catch (error) {
            console.warn('本地服务器未运行，将使用手动模式');
        }
    }

    // 开始设备发现
    async startDiscovery() {
        try {
            // 尝试从本地服务器获取设备列表
            const response = await fetch(`${this.httpEndpoint}/devices`);
            if (response.ok) {
                const devices = await response.json();
                devices.forEach(device => this.addDevice(device));
            }
        } catch (error) {
            console.warn('从本地服务器获取设备失败:', error);
        }
    }

    // 手动添加设备
    async addManualDevice(ip) {
        try {
            // 尝试连接设备
            const deviceInfo = await this.probeDevice(ip);
            if (deviceInfo) {
                this.addDevice({
                    ...deviceInfo,
                    address: ip,
                    isManual: true
                });
                return true;
            }
            throw new Error('无法连接到设备');
        } catch (error) {
            console.error('添加设备失败:', error);
            throw error;
        }
    }

    // 探测设备
    async probeDevice(ip) {
        try {
            // 尝试获取设备描述
            const response = await fetch(`http://${ip}:8000/description.xml`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseDeviceXML(xml);
            }
            return null;
        } catch (error) {
            console.error('探测设备失败:', error);
            return null;
        }
    }

    // 添加设备到列表
    addDevice(deviceInfo) {
        if (!this.devices.has(deviceInfo.UDN)) {
            this.devices.set(deviceInfo.UDN, deviceInfo);
            this.onDeviceFound(deviceInfo);
        }
    }

    // 获取所有设备
    getDevices() {
        return Array.from(this.devices.values());
    }

    // 连接到设备
    async connectToDevice(device) {
        this.currentDevice = device;
        await this.getDeviceServices();
        return true;
    }

    // 获取设备服务
    async getDeviceServices() {
        if (!this.currentDevice) return;
        
        try {
            if (this.currentDevice.isManual) {
                // 对于手动添加的设备，使用默认服务配置
                this.currentDevice.services = [{
                    serviceType: 'urn:schemas-upnp-org:service:AVTransport:1',
                    controlURL: `http://${this.currentDevice.address}:8000/control`
                }];
            } else {
                // 从本地服务器获取服务信息
                const response = await fetch(`${this.httpEndpoint}/device/${this.currentDevice.UDN}/services`);
                if (response.ok) {
                    this.currentDevice.services = await response.json();
                }
            }
        } catch (error) {
            console.error('获取设备服务失败:', error);
            throw error;
        }
    }

    // 发送SOAP控制命令
    async sendSOAPAction(serviceType, action, args = {}) {
        if (!this.currentDevice) throw new Error('未连接设备');

        const service = this.currentDevice.services.find(s => s.serviceType === serviceType);
        if (!service) throw new Error('服务不可用');

        try {
            if (this.currentDevice.isManual) {
                // 直接发送SOAP请求到设备
                return await this.sendDirectSOAP(service.controlURL, serviceType, action, args);
            } else {
                // 通过本地服务器发送命令
                return await this.sendServerSOAP(serviceType, action, args);
            }
        } catch (error) {
            console.error('发送SOAP命令失败:', error);
            throw error;
        }
    }

    // 直接发送SOAP请求到设备
    async sendDirectSOAP(controlURL, serviceType, action, args) {
        const soapBody = this.buildSOAPBody(action, args);
        const response = await fetch(controlURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': `"${serviceType}#${action}"`,
            },
            body: soapBody
        });

        if (!response.ok) {
            throw new Error(`SOAP请求失败: ${response.status}`);
        }

        return { success: true };
    }

    // 通过本地服务器发送SOAP请求
    async sendServerSOAP(serviceType, action, args) {
        const response = await fetch(`${this.httpEndpoint}/soap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                deviceId: this.currentDevice.UDN,
                serviceType,
                action,
                args
            })
        });

        if (!response.ok) {
            throw new Error(`服务器请求失败: ${response.status}`);
        }

        return await response.json();
    }

    // 构建SOAP消息体
    buildSOAPBody(action, args) {
        const argsXml = Object.entries(args)
            .map(([key, value]) => `<${key}>${value}</${key}>`)
            .join('');

        return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
    <s:Body>
        <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
            ${argsXml}
        </u:${action}>
    </s:Body>
</s:Envelope>`;
    }

    // 解析设备XML描述
    parseDeviceXML(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const device = doc.querySelector('device');
        if (!device) return null;

        return {
            UDN: device.querySelector('UDN')?.textContent || `uuid:${Date.now()}`,
            friendlyName: device.querySelector('friendlyName')?.textContent || '未知设备',
            manufacturer: device.querySelector('manufacturer')?.textContent || '未知厂商',
            modelName: device.querySelector('modelName')?.textContent || '未知型号',
            deviceType: device.querySelector('deviceType')?.textContent || 'urn:schemas-upnp-org:device:MediaRenderer:1'
        };
    }

    // 事件处理
    onDeviceFound(deviceInfo) {
        // 发送设备发现消息到扩展
        chrome.runtime.sendMessage({
            type: 'DEVICE_FOUND',
            device: deviceInfo
        });
    }
}

export default DLNAClient; 