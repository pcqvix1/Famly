// worker.js
const CLOUDINARY_CLOUD_NAME = "dqn28emva";
const CLOUDINARY_UPLOAD_PRESET = "famly_chat";

self.onmessage = async function(e) {
    const { file, type, text } = e.data;
    
    try {
        const resourceType = getResourceType(file.type);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        self.postMessage({ success: true, data: data, type, text });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};

function getResourceType(fileType) {
    if (fileType.includes('image')) return 'image';
    if (fileType.includes('video')) return 'video';
    if (fileType.includes('audio')) return 'video';
    return 'raw';
}