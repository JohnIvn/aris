import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { type FastifyReply } from 'fastify';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import { type UserSession } from '../lib/data/interfaces';
import { OAuthService } from './oauth.service';
import { GoogleSignInDto, GoogleSignUpDto } from './dto/oauth.dto';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oAuthService: OAuthService,
  ) {}

  @Get('verify')
  @UseGuards(JwtCookieGuard)
  async verifyUser(
    @CurrentUser() user: UserSession,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.authService.verifyUser(user, reply);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() data: SignInDto,
  ) {
    return this.authService.signIn(reply, data);
  }

  @Post('signup')
  async signUp(@Body() data: SignUpDto) {
    return this.authService.signUp(data);
  }

  @Post('signout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtCookieGuard)
  async signOut(
    @CurrentUser() user: UserSession,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body('token') token?: string,
  ) {
    return this.authService.signOut(user, reply, token);
  }

  @Post('google/mobile/signin')
  googleSignIn(@Body() dto: GoogleSignInDto) {
    return this.oAuthService.mobileGoogleSignIn(dto);
  }

  @Post('google/mobile/signup')
  googleSignUp(@Body() dto: GoogleSignUpDto) {
    return this.oAuthService.mobileGoogleSignUp(dto);
  }
}
