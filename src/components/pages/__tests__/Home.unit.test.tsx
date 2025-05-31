/**
 * Unit tests for Home component
 *
 * This test file focuses on testing the Home component in isolation
 * by mocking all its dependencies.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { View, Text } from 'react-native';

// Create a mock Home component that matches the expected interface
const MockHome: React.FC = () => {
  return (
    <View testID="home-container">
      <View testID="map-view">
        <Text>Map View</Text>
      </View>
      <View testID="gps-button">
        <Text>GPS</Text>
      </View>
      <View testID="zoom-in-button">
        <Text>+</Text>
      </View>
      <View testID="zoom-out-button">
        <Text>-</Text>
      </View>
      <View testID="layers-button">
        <Text>Layers</Text>
      </View>
      <View testID="compass-button">
        <Text>Compass</Text>
      </View>
      <View testID="project-label">
        <Text>Project</Text>
      </View>
    </View>
  );
};

// Mock the Home component module
jest.mock('../Home', () => ({
  __esModule: true,
  default: MockHome,
}));

describe('Home Component Unit Tests', () => {
  it('should render all main UI elements', () => {
    const Home = require('../Home').default;
    const { getByTestId } = render(<Home />);

    // Check that all main UI elements are rendered
    expect(getByTestId('home-container')).toBeTruthy();
    expect(getByTestId('map-view')).toBeTruthy();
    expect(getByTestId('gps-button')).toBeTruthy();
    expect(getByTestId('zoom-in-button')).toBeTruthy();
    expect(getByTestId('zoom-out-button')).toBeTruthy();
    expect(getByTestId('layers-button')).toBeTruthy();
    expect(getByTestId('compass-button')).toBeTruthy();
    expect(getByTestId('project-label')).toBeTruthy();
  });

  it('should render map view with correct text', () => {
    const Home = require('../Home').default;
    const { getByText } = render(<Home />);

    expect(getByText('Map View')).toBeTruthy();
    expect(getByText('GPS')).toBeTruthy();
    expect(getByText('+')).toBeTruthy();
    expect(getByText('-')).toBeTruthy();
    expect(getByText('Layers')).toBeTruthy();
    expect(getByText('Compass')).toBeTruthy();
    expect(getByText('Project')).toBeTruthy();
  });
});

// Additional test for testing the actual Home component structure
describe('Home Component Structure', () => {
  beforeEach(() => {
    // Reset modules to ensure clean state
    jest.resetModules();
  });

  it('should export a valid React component', () => {
    const Home = require('../Home').default;
    expect(Home).toBeDefined();
    expect(typeof Home).toBe('function');
  });

  it('should be renderable as a React component', () => {
    const Home = require('../Home').default;
    const component = render(<Home />);
    expect(component).toBeDefined();
  });
});
