import { useState, useEffect } from "react";
import { Col } from "react-bootstrap";
import dayjs from 'dayjs';
import { getThumbnail } from "@app/services/thumbnails";
import { Camera, Video } from "@app/types";

export type ThumbnailProps = {
    camera: Camera
    video: Video
    setActive: Function
}

export function Thumbnail({camera, video, setActive}: ThumbnailProps) {
    const [img, setImg] = useState<any|null>(null);

    useEffect(() => {
        getThumbnail(camera.name, video.timestamp)
            .then(response => setImg(URL.createObjectURL(response.data)))
    }, []);

    return img !== null ? <>
        <Col xs={4} className='thumbnail mb-3'
            id={`video-${video.timestamp}`}
            onClick={_ => setActive(video)}
        >
            <img src={img} className='thumbnail' />
            <small>{dayjs(video.timestamp, 'YYYYMMDDHHmmss').format('hh:mm a')}</small>
        </Col>
    </> : <></>
}
