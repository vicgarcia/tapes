import httpClient from './base'

export function getThumbnail(cameraName: string, timestamp: string) {
    const url = `/cameras/${cameraName}/${timestamp}/thumbnail`;
    return httpClient.get(url, {responseType: 'blob'});
}
