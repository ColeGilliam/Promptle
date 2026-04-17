import { findBestTopicMatch } from './topic-match';
import type { TopicInfo } from './topics-list';

describe('findBestTopicMatch', () => {
  const topics: TopicInfo[] = [
    { topicId: 1, topicName: 'Pokemon' },
    { topicId: 2, topicName: 'Marvel Characters' },
    { topicId: 3, topicName: 'The Simpsons' },
  ];

  it('matches exact topics case-insensitively', () => {
    expect(findBestTopicMatch('pokemon', topics)).toEqual(topics[0]);
  });

  it('matches close typos for existing topics', () => {
    expect(findBestTopicMatch('Pokeman', topics)).toEqual(topics[0]);
  });

  it('matches topics after article and plural normalization', () => {
    expect(findBestTopicMatch('Simpsons', topics)).toEqual(topics[2]);
    expect(findBestTopicMatch('Marvel Character', topics)).toEqual(topics[1]);
  });

  it('does not hijack broad custom topics', () => {
    expect(findBestTopicMatch('Marvel', topics)).toBeNull();
    expect(findBestTopicMatch('Marvel Movies', topics)).toBeNull();
  });
});
