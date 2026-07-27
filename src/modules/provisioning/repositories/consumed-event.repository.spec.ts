import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '@new-hros/libs-sql';
import { ConsumedEventRepository } from './consumed-event.repository';
import { ConsumedEvent } from '../entities/consumed-event.entity';

describe('ConsumedEventRepository', () => {
  let repository: ConsumedEventRepository;
  let mockTransactionService: any;
  let mockEntityManager: any;
  let mockTypeormRepository: any;

  beforeEach(async () => {
    mockTypeormRepository = {
      count: jest.fn(),
      save: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockReturnValue(mockTypeormRepository),
    };

    mockTransactionService = {
      getManager: jest.fn().mockReturnValue(mockEntityManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumedEventRepository,
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compile();

    repository = module.get<ConsumedEventRepository>(ConsumedEventRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should check if event exists', async () => {
    mockTypeormRepository.count.mockResolvedValue(1);

    const result = await repository.exists('evt-123');

    expect(result).toBe(true);
    expect(mockTypeormRepository.count).toHaveBeenCalledWith({ where: { id: 'evt-123' } });
  });

  it('should save a consumed event', async () => {
    const event = new ConsumedEvent();
    event.id = 'evt-123';
    event.topic = 'test-topic';

    mockTypeormRepository.save.mockResolvedValue(event);

    const result = await repository.save(event);

    expect(result).toEqual(event);
    expect(mockTypeormRepository.save).toHaveBeenCalledWith(event);
  });
});
