import React, { useEffect, useState } from "react";
import { Container, Row, Col, Form } from "react-bootstrap";
import dayjs from 'dayjs';

export type DateSelectProps = {
    selected: Date|null
    setSelected: Function
}

export function DateSelect({selected, setSelected}: DateSelectProps) {

    useEffect(() => {
        if (selected === null) {
            setSelected(new Date());
        }
    }, []);

    const updateSelected = (value: string) => {
        console.log(value);
        setSelected(new Date(value.replace(/-/g, '\/')));
    }

    return <div className='d-grid gap-3'>
        <Form.Control className='p-2'
            type='date'
            value={selected !== null ? dayjs(selected).format('YYYY-MM-DD') : undefined}
            onChange={(e) => updateSelected(e.currentTarget.value)}
        />
    </div>
}
