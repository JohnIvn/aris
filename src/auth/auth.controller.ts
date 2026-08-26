import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { type FastifyReply } from 'fastify';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { type UserSession } from '../lib/data/interfaces';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('verify')
  async verifyUser(
    @CurrentUser() user: UserSession,
    @Res() reply: FastifyReply,
  ) {
    return this.authService.verifyUser(user, reply);
  }

  @Post('signin')
  async signIn(@Res() reply: FastifyReply, @Body() data: SignInDto) {
    return this.authService.signIn(reply, data);
  }

  @Post('signup')
  async signUp(@Body() data: SignUpDto) {
    return this.authService.signUp(data);
  }

  @Post('signout')
  async signOut(
    @CurrentUser() user: UserSession,
    @Res() reply: FastifyReply,
    @Body() token: string,
  ) {
    return this.authService.signOut(user, reply, token);
  }
}
