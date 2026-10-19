// core/detection/client-detection.js
// Обнаружение OS, VM и подозрительного окружения

export async function detectEnvironment() {
    const checks = {
        userAgent: detectUserAgent(),
        webgl: detectWebGL(),
        canvas: await detectCanvasFingerprinting(),
        timezone: detectTimezone(),
        screenResolution: detectScreenResolution(),
        tor: detectTorBrowser()
    };

    const isSuspicious = Object.values(checks).some(v => v.suspicious === true);
    const score = Object.values(checks).filter(v => v.suspicious === true).length;

    return {
        checks,
        isSuspicious,
        score,
        details: {
            os: checks.userAgent.os,
            browser: checks.userAgent.browser,
            vendor: checks.webgl.vendor,
            renderer: checks.webgl.renderer
        }
    };
}

// UserAgent анализ
function detectUserAgent() {
    const ua = navigator.userAgent.toLowerCase();
    const osList = [
        { name: 'Tails', pattern: /tails/i },
        { name: 'Whonix', pattern: /whonix/i },
        { name: 'Parrot OS', pattern: /parrot/i },
        { name: 'Linux', pattern: /linux/i },
        { name: 'Windows', pattern: /windows/i },
        { name: 'macOS', pattern: /macintosh|mac os x/i }
    ];

    let detected = 'Unknown';
    for (const os of osList) {
        if (os.pattern.test(ua)) {
            detected = os.name;
            break;
        }
    }

    // Проверка браузера
    let browser = 'Unknown';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';

    // Tor Browser detection
    const isTor = ua.includes('firefox') && window.navigator.webdriver === undefined;

    return {
        os: detected,
        browser: browser,
        isTor: isTor,
        suspicious: detected === 'Tails' || detected === 'Whonix' || isTor,
        raw: navigator.userAgent
    };
}

// WebGL detection (VMware, VirtualBox, SwiftShader)
function detectWebGL() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { vendor: 'Unknown', renderer: 'Unknown', suspicious: false };

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return { vendor: 'Unknown', renderer: 'Unknown', suspicious: false };

        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        const suspicious = 
            renderer.includes('VMware') ||
            renderer.includes('VirtualBox') ||
            renderer.includes('SwiftShader') ||
            renderer.includes('Microsoft Basic Render Driver') ||
            vendor.includes('Google') && renderer.includes('ANGLE');

        return { vendor, renderer, suspicious };
    } catch {
        return { vendor: 'Unknown', renderer: 'Unknown', suspicious: false };
    }
}

// Canvas fingerprinting
async function detectCanvasFingerprinting() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#069';
        ctx.fillRect(100, 100, 56, 56);
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.fillText('Purple 3000', 20, 140);
        
        const dataUrl = canvas.toDataURL();
        
        // Проверяем, есть ли аномалии (Tails/Whonix часто имеют проблемы с canvas)
        const isSuspicious = dataUrl.length < 5000 || dataUrl.includes('data:image/png;base64,');
        
        return {
            fingerprint: dataUrl.substring(0, 100) + '...',
            suspicious: isSuspicious,
            length: dataUrl.length
        };
    } catch {
        return { fingerprint: null, suspicious: true };
    }
}

// Timezone check
function detectTimezone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = new Date().getTimezoneOffset();
    
    // UTC mismatch (подозрительно)
    const isUTC = tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT';
    const suspicious = isUTC || offset === 0;

    return {
        timezone: tz,
        offset: offset,
        suspicious: suspicious
    };
}

// Screen resolution
function detectScreenResolution() {
    const width = screen.width;
    const height = screen.height;
    
    // Подозрительные разрешения (VM)
    const suspicious = 
        (width === 1024 && height === 768) ||
        (width === 1280 && height === 720) ||
        (width === 1366 && height === 768) ||
        (width === 1920 && height === 1080 && screen.availWidth === width);

    return {
        width,
        height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        suspicious: suspicious
    };
}

// Tor Browser detection
function detectTorBrowser() {
    const isTor = 
        navigator.userAgent.includes('Firefox') &&
        navigator.webdriver === undefined &&
        window.navigator.plugins.length === 0 &&
        window.navigator.mimeTypes.length === 0 &&
        !window.chrome;

    return {
        isTor: isTor,
        suspicious: isTor
    };
}

// Get fingerprint
export async function getFingerprint() {
    const components = [];
    
    // UserAgent
    components.push(navigator.userAgent);
    
    // Screen
    components.push(`${screen.width}x${screen.height}`);
    
    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Language
    components.push(navigator.language);
    
    // Canvas
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 256, 256);
        components.push(canvas.toDataURL());
    } catch {}
    
    // WebGL
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
            }
        }
    } catch {}
    
    const data = components.join('::');
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}