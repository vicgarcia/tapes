import { useState, useEffect } from "react";
import { Form } from "react-bootstrap";
import { Camera } from '@app/types';
import { getCameras } from '@app/services/cameras';

export type CameraSelectProps = {
    selected: Camera|null
    setSelected: Function
}

export function CameraSelect({selected, setSelected}: CameraSelectProps) {
    const [cameras, setCameras] = useState<Array<Camera>>([]);

    useEffect(() => {
        getCameras().then(response => {
            setCameras(response);
            // default to first camera in list
            if (response.length > 0) {
                setSelected(response[0]);
            }
        });
    }, []);

    const updateSelected = (value: string) => {
        const camera = cameras.find(obj => obj.name === value);
        setSelected(camera);
    }

    return <div className="d-grid gap-3">
        <Form.Select className="p-2"
            value={selected !== null ? selected.name : undefined}
            onChange={(e) => updateSelected(e.currentTarget.value)}
        >
            {cameras.map(camera => <option value={camera.name}>{camera.name.toUpperCase()}</option>)}
        </Form.Select>
    </div>
}
