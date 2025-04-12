import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Form, Button } from "react-bootstrap";
import { useAuth, AuthProviderType } from "@app/services/auth";

export function Login() {
    const [login, setLogin] = useState<string|null>(null);
    const [password, setPassword] = useState<string|null>(null);
    const [error, setError] = useState<string|null>(null);

    const navigate = useNavigate();
    const auth = useAuth() as AuthProviderType;

    useEffect(() => {
        if (auth.isAuthenticated === true) {
            navigate('/dashboard');
        }
    }, []);

    const updateLogin = (value: string) => {
        setError(null);
        setLogin(value);
    };

    const updatePassword = (value: string) => {
        setError(null);
        setPassword(value);
    };

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        let hasError = false;
        if (login === null || login === '') {
            setError('enter login')
            hasError = true;
        }
        if (password === null || password === '') {
            setError('enter password')
            hasError = true;
        }
        if (!hasError) {
            auth.login(login, password)
                // @ts-ignore
                .then(_ => {
                    navigate('/dashboard');
                })
                // @ts-ignore
                .catch(err => {
                    setError(err.response.data.error);
                });
        }
    };

    return <Container fluid='md'>
        <Container className='text-center' style={{marginTop: '200px', width: '300px'}}>
            <Form onSubmit={submit}>
                <Form.Group className='mb-2'>
                    <Form.Control type='text'
                        placeholder='username'
                        className='login-form-textbox text-center'
                        value={login !== null ? login : ''}
                        onChange={(e) => updateLogin(e.currentTarget.value)}
                        // isInvalid={error !== null}
                    />
                </Form.Group>
                <Form.Group className='mb-3'>
                    <Form.Control type='password'
                        placeholder='password'
                        className='login-form-textbox text-center'
                        value={password !== null ? password : ''}
                        onChange={(e) => updatePassword(e.currentTarget.value)}
                        // isInvalid={error !== null}
                    />
                </Form.Group>
                <div className='text-end'>
                    <Button type='submit' variant='primary' size="sm" className='px-4'>log in</Button>
                </div>
            </Form>
        </Container>
    </Container>
}
