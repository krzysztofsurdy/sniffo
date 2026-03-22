<?php
declare(strict_types=1);

namespace App\Controller;

use App\Service\UserServiceInterface;
use App\Service\UserService;

abstract class AbstractController
{
    abstract protected function handle(): void;
}

class UserController extends AbstractController
{
    public function __construct(
        private readonly UserServiceInterface $userService,
    ) {}

    protected function handle(): void {}

    public function index(): array
    {
        return $this->userService->findAll();
    }

    public function show(int $id): ?array
    {
        return $this->userService->findById($id);
    }
}
