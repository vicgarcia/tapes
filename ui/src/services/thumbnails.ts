import httpClient from './base'

export function getThumbnail(cameraName: string, slug: string, mediaType: 'recordings' | 'events') {
    const url = `/cameras/${cameraName}/${mediaType}/${slug}/thumbnail`;
    return httpClient.get(url, {responseType: 'blob'});
}
