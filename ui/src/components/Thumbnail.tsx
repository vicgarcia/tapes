import { useState, useEffect } from "react";
import { Col } from "react-bootstrap";
import dayjs from 'dayjs';
import { getThumbnail } from "@app/services/thumbnails";
import { Camera, Recording } from "@app/types";

export type ThumbnailProps = {
    camera: Camera
    recording: Recording
    setActive: Function
}

export function Thumbnail({camera, recording, setActive}: ThumbnailProps) {
    const [img, setImg] = useState<any|null>(null);

    useEffect(() => {
        getThumbnail(camera.name, recording.timestamp)
            .then(response => setImg(URL.createObjectURL(response.data)))
    }, []);

    return img !== null ? <>
        <Col xs={4} className='thumbnail mb-3'
            id={`recording-${recording.timestamp}`}
            onClick={_ => setActive(recording)}
        >
            <img src={img} className='thumbnail' />
            <small>{dayjs(recording.timestamp, 'YYYYMMDDHHmmss').format('hh:mm a')}</small>
        </Col>
    </> : <></>
}
