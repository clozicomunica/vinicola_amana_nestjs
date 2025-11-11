import { Test, TestingModule } from '@nestjs/testing';
import { NuvemshopService } from './nuvemshop.service';

describe('NuvemshopService', () => {
  let service: NuvemshopService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NuvemshopService],
    }).compile();

    service = module.get<NuvemshopService>(NuvemshopService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
