import { Form } from "react-bootstrap";

export type MediaType = 'recordings' | 'events';

export type TypeSelectProps = {
    selected: MediaType
    setSelected: (value: MediaType) => void
}

export function TypeSelect({selected, setSelected}: TypeSelectProps) {
    const updateSelected = (value: string) => {
        setSelected(value as MediaType);
    }

    return <div className="d-grid gap-3">
        <Form.Select className="p-2"
            value={selected}
            onChange={(e) => updateSelected(e.currentTarget.value)}
        >
            <option value="recordings">RECORDINGS</option>
            <option value="events">EVENTS</option>
        </Form.Select>
    </div>
}