
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./services/geminiService');

describe('App', () => {
  it('renders the App component', () => {
    render(<App />);
    screen.debug();
  });
});
