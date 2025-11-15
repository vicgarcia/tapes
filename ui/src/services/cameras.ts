import httpClient from './base'

export function getCameras() {
    return httpClient.get('/cameras')
        .then(response => response.data);
};

export function getRecordingsByDate(cameraName: string, day: string) {
    const url = `/cameras/${cameraName}/recordings`;
    return httpClient.get(url, {params: { day }})
        .then(response => response.data);
}
