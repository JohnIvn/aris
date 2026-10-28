import { WebSocketGateway } from '@nestjs/websockets';
import { BiometricsService } from './biometrics.service';

@WebSocketGateway()
export class BiometricsGateway {
  constructor(private readonly biometricsService: BiometricsService) {}
}
