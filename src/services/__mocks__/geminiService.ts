
export const processVoiceCommand = jest.fn().mockResolvedValue({ text: 'Mocked response' });
export const runAIDiagnosis = jest.fn().mockResolvedValue('Mocked AI diagnosis');
export const fetchDTCDefinition = jest.fn().mockResolvedValue('Mocked DTC definition');
export const getRouteRecommendation = jest.fn().mockResolvedValue({ recommendation: 'Mocked recommendation', alerts: [] });
