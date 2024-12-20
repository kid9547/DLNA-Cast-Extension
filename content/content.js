// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_VIDEO_INFO') {
        const videoInfo = getVideoInformation();
        sendResponse({
            videoFound: videoInfo !== null,
            videoInfo: videoInfo
        });
    }
    return true;
});

// 获取页面视频信息
function getVideoInformation() {
    const videos = document.getElementsByTagName('video');
    if (videos.length === 0) return null;

    // 获取正在播放的视频
    const playingVideo = Array.from(videos).find(video => !video.paused);
    if (!playingVideo) return null;

    // 尝试获取视频标题
    let title = '';
    // 尝试从不同来源获取标题
    if (document.querySelector('meta[property="og:title"]')) {
        title = document.querySelector('meta[property="og:title"]').content;
    } else if (document.title) {
        title = document.title;
    }

    return {
        title: title,
        currentTime: playingVideo.currentTime,
        duration: playingVideo.duration,
        src: playingVideo.src || window.location.href,
        poster: playingVideo.poster,
        videoElement: playingVideo
    };
}

// 监听视频状态变化
function setupVideoEventListeners(video) {
    const events = ['play', 'pause', 'timeupdate', 'seeking', 'seeked'];
    
    events.forEach(eventName => {
        video.addEventListener(eventName, () => {
            chrome.runtime.sendMessage({
                type: 'VIDEO_STATE_CHANGED',
                state: {
                    eventType: eventName,
                    currentTime: video.currentTime,
                    paused: video.paused
                }
            });
        });
    });
}

// 监视DOM变化，检测新的视频元素
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'VIDEO') {
                setupVideoEventListeners(node);
            }
        });
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
}); 