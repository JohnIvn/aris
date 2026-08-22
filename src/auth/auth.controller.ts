import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { type FastifyReply } from 'fastify';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
  async signIn(@Res() reply: FastifyReply, @Body() data: SignInDto) {
    return this.authService.signIn(reply, data);
  }

  @Post('signup')
  async signUp(@Body() data: SignUpDto) {
    return this.authService.signUp(data);
  }
}
