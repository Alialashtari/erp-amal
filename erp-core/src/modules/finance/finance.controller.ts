import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { TransactionsService } from './transactions.service';
import { StructureService } from './structure.service';
import { ReportsService } from './reports.service';
import { BudgetsService } from './budgets.service';
import { ReceiptsService } from './receipts.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import {
  CreateAccountDto,
  CreateCostCenterDto,
  CreateFundDto,
  RejectTransactionDto,
  ReverseTransactionDto,
  SetActiveDto,
  UpsertApprovalRuleDto,
} from './dto/structure.dtos';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly structure: StructureService,
    private readonly reports: ReportsService,
    private readonly budgets: BudgetsService,
    private readonly receipts: ReceiptsService,
  ) {}

  // ── transactions ──
  @Post('transactions')
  @RequirePermissions('finance.create')
  createTransaction(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.transactions.create(dto, user);
  }

  @Get('transactions')
  @RequirePermissions('finance.view')
  findTransactions(@Query() query: QueryTransactionsDto) {
    return this.transactions.findAll(query);
  }

  @Get('transactions/:id')
  @RequirePermissions('finance.view')
  findTransaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.findOne(id);
  }

  @Post('transactions/:id/approve')
  @RequirePermissions('finance.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.transactions.approve(id, user);
  }

  @Post('transactions/:id/reject')
  @RequirePermissions('finance.approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transactions.reject(id, dto.reason, user);
  }

  @Post('transactions/:id/reverse')
  @RequirePermissions('finance.approve')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transactions.reverse(id, dto.reason, user);
  }

  @Post('transactions/:id/receipt')
  @RequirePermissions('finance.create')
  issueReceipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.receipts.issueForTransaction(id, user.userId);
  }

  // ── structure ──
  @Get('accounts')
  @RequirePermissions('finance.view')
  listAccounts() {
    return this.structure.listAccounts();
  }

  @Post('accounts')
  @RequirePermissions('finance.manage_structure')
  createAccount(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.structure.createAccount(dto, user.userId);
  }

  @Patch('accounts/:id/active')
  @RequirePermissions('finance.manage_structure')
  setAccountActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.structure.setAccountActive(id, dto.isActive, user.userId);
  }

  @Get('funds')
  @RequirePermissions('finance.view')
  listFunds() {
    return this.structure.listFunds();
  }

  @Post('funds')
  @RequirePermissions('finance.manage_structure')
  createFund(@Body() dto: CreateFundDto, @CurrentUser() user: AuthenticatedUser) {
    return this.structure.createFund(dto, user.userId);
  }

  @Patch('funds/:id/active')
  @RequirePermissions('finance.manage_structure')
  setFundActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.structure.setFundActive(id, dto.isActive, user.userId);
  }

  @Get('cost-centers')
  @RequirePermissions('finance.view')
  listCostCenters() {
    return this.structure.listCostCenters();
  }

  @Post('cost-centers')
  @RequirePermissions('finance.manage_structure')
  createCostCenter(@Body() dto: CreateCostCenterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.structure.createCostCenter(dto, user.userId);
  }

  @Get('approval-rules')
  @RequirePermissions('finance.view')
  listApprovalRules() {
    return this.structure.listApprovalRules();
  }

  @Post('approval-rules')
  @RequirePermissions('finance.manage_structure')
  upsertApprovalRule(@Body() dto: UpsertApprovalRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.structure.upsertApprovalRule(dto, user.userId);
  }

  // ── budgets ──
  @Get('budgets')
  @RequirePermissions('finance.view')
  listBudgets() {
    return this.budgets.findAll();
  }

  @Post('budgets')
  @RequirePermissions('finance.manage_structure')
  createBudget(@Body() dto: CreateBudgetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.budgets.create(dto, user.userId);
  }

  @Post('budgets/:id/close')
  @RequirePermissions('finance.manage_structure')
  closeBudget(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.budgets.close(id, user.userId);
  }

  // ── reports ──
  @Get('reports/fund-balances')
  @RequirePermissions('finance.view')
  fundBalances() {
    return this.reports.fundBalances();
  }

  @Get('reports/trial-balance')
  @RequirePermissions('finance.view')
  trialBalance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.trialBalance(from, to);
  }

  @Get('reports/income-expense')
  @RequirePermissions('finance.view')
  incomeExpense(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.incomeExpenseSummary(from, to);
  }
}
