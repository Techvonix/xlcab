import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  ConfirmDeparturesDto,
  CreateLineDto,
  DeparturesQueryDto,
  LineExceptionDto,
  LineSearchDto,
  OperatorProfileDto,
  UpdateDepartureDto,
  UpdateLineDto,
} from './dto';
import { LinesService } from './lines.service';

/** Espace opérateur : profil, lignes régulières, départs (bourse, étape 1). */
@Controller('api/v1/operators/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class OperatorsController {
  constructor(private lines: LinesService) {}

  @Get()
  profile(@Req() req: any) {
    return this.lines.profile(req.user.sub);
  }

  @Put()
  saveProfile(@Req() req: any, @Body() dto: OperatorProfileDto) {
    return this.lines.saveProfile(req.user.sub, dto);
  }

  @Get('vehicles')
  vehicles(@Req() req: any) {
    return this.lines.vehicles(req.user.sub);
  }

  @Get('lines')
  list(@Req() req: any) {
    return this.lines.lines(req.user.sub);
  }

  @Post('lines')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateLineDto) {
    return this.lines.create(req.user.sub, dto);
  }

  @Patch('lines/:id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLineDto) {
    return this.lines.update(req.user.sub, id, dto);
  }

  @Post('lines/:id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.lines.setStatus(req.user.sub, id, 'paused');
  }

  @Post('lines/:id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.lines.setStatus(req.user.sub, id, 'active');
  }

  @Post('lines/:id/close')
  @HttpCode(HttpStatus.OK)
  close(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.lines.setStatus(req.user.sub, id, 'closed');
  }

  @Post('lines/:id/exceptions')
  @HttpCode(HttpStatus.OK)
  addException(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LineExceptionDto) {
    return this.lines.addException(req.user.sub, id, dto);
  }

  @Delete('lines/:id/exceptions/:date')
  removeException(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('date') date: string) {
    return this.lines.removeException(req.user.sub, id, date);
  }

  @Get('departures')
  departures(@Req() req: any, @Query() q: DeparturesQueryDto) {
    return this.lines.departures(req.user.sub, q);
  }

  @Post('departures/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: any, @Body() dto: ConfirmDeparturesDto) {
    return this.lines.confirm(req.user.sub, dto);
  }

  @Patch('departures/:id')
  updateDeparture(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartureDto) {
    return this.lines.setDepartureClosed(req.user.sub, id, dto.closed);
  }

  /** « Je pars quand même » : départ garanti sans attendre le seuil. */
  @Post('departures/:id/guarantee')
  @HttpCode(HttpStatus.OK)
  guarantee(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.lines.guarantee(req.user.sub, id);
  }
}

/** Recherche de départs de lignes régulières : tout compte connecté. */
@Controller('api/v1/lines')
@UseGuards(JwtAuthGuard)
export class LinesSearchController {
  constructor(private lines: LinesService) {}

  @Get('search')
  search(@Query() q: LineSearchDto) {
    return this.lines.search(q);
  }
}
