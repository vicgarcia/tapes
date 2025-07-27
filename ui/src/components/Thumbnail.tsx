import { useState, useEffect } from "react";
import { Col } from "react-bootstrap";
import dayjs from 'dayjs';
import { getThumbnail } from "@app/services/thumbnails";
import { Camera, Video } from "@app/types";

export type ThumbnailProps = {
    camera: Camera
    video: Video
    setActive: Function
    mediaType: 'recordings' | 'events'
}

export function Thumbnail({camera, video, setActive, mediaType}: ThumbnailProps) {
    const [img, setImg] = useState<any|null>(null);

    useEffect(() => {
        const slug = mediaType === 'events' && video.event_type 
            ? `${video.timestamp}-${video.event_type}`
            : video.timestamp;
        getThumbnail(camera.name, slug, mediaType)
            .then(response => setImg(URL.createObjectURL(response.data)))
    }, []);

    return img !== null ? <>
        <Col xs={4} className='thumbnail mb-3'
            onClick={_ => setActive(video)}
        >
            <img src={img} className='thumbnail' />
            <small>{dayjs(video.timestamp, 'YYYYMMDDHHmmss').format('hh:mm a')}</small>
        </Col>
    </> : <></>
}
